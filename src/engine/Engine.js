const { get, uniq } = require('lodash');
const { Query } = require('mingo');
const uuid = require('uuid/v1');

const {
  marketTimes,
  assert,
  formatJSON,
  getRiskFromPercentage,
  TEN_SECONDS,
  FIVE_SECONDS,
  FIVE_HOURS,
  TEN_MINUTES
} = require('../services/utils');
const { Trade, queries: { getActiveRules, getIncompleteTrades } } = require('../models');
const rh = require('../services/rhApiService');
const tv = require('../services/tvApiService');

// Todo: move constants to `process.env.js`
const OVERRIDE_MARKET_CLOSE = true;

class Engine {
  constructor() {
    this.users = [];
    this.rules = [];
    this.userTokens = new Map();
    this.userAccounts = new Map();
  }

  async start() {
    try {
      await this.loadRulesAndAccounts();
      await this.processFeeds();

      setInterval(() => this.loadRulesAndAccounts(), TEN_SECONDS);
      setInterval(() => this.processFeeds(), FIVE_SECONDS);
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Prepares user objects for use on @method processFeeds.
   * Steps include:
   * - Get fresh rules and users from DB
   * - Get or refresh(after 5h) user tokens
   * - Get or refresh(after 10m) user accounts
   * - Get fresh user orders
   * @returns {Promise<void>}
   */
  async loadRulesAndAccounts() {
    // Fetch fresh rules
    this.rules = await getActiveRules();
    // Fetch fresh users
    this.users = uniq(this.rules.map(rule => rule.user.toObject()));

    // Store all user tokens for authentication
    const tokenPromises = this.users.map(user => {
      const userToken = this.userTokens.get(user._id.toString());

      // Refresh token only after 5 hours
      if (!userToken || (((new Date()) - new Date(userToken.date)) >= FIVE_HOURS)) {
        return rh.auth(user.brokerConfig)
          .then(token => {
            user.token = token;
            this.userTokens.set(user._id.toString(), { token, date: new Date() })
          });
      }

      // Append token
      user.token = userToken.token;
      return null;
    }).filter(u => u);

    await Promise.all(tokenPromises);

    // Append user accounts
    const accountPromises = this.users.map(user => {
      const userAccount = this.userAccounts.get(user._id.toString());

      // Refresh account only after 10 mins
      if (!userAccount || (((new Date()) - new Date(userAccount.date)) >= TEN_MINUTES)) {
        return rh.getAccount(user)
          .then(account => {
            user.account = account;
            this.userAccounts.set(user._id.toString(), { account, date: new Date() })
          })
      }

      // Append account
      user.account = userAccount.account;
      return null;
    }).filter(a => a);

    // Append fresh user orders
    const orderPromises = this.users.map(user => rh.getOrders(user)
      .then(orders => user.orders = orders));

    await Promise.all(accountPromises.concat(orderPromises));
  }

  async processFeeds() {
    try {
      const { isMarketClosed } = marketTimes();

      if (!OVERRIDE_MARKET_CLOSE && isMarketClosed) {
        return;
      }

      const symbols = uniq(this.rules.map(r => `${r.exchange}:${r.symbol}`));
      const [quotes, trades] = await Promise.all([tv.getQuotes(...symbols), getIncompleteTrades()]);
      const promises = [];

      this.rules.forEach(async rule => {
        const { lastOrderId: orderId, risk, numberOfShares, symbol } = rule;

        const user = this.users.find(u => u._id.equals(rule.user._id));
        assert(user, `User ${rule.user._id} not found in rule ${rule._id}`);

        const quote = quotes.find(q => q.symbol === `${rule.exchange}:${rule.symbol}`);
        assert(quote, `Quote for ${rule.symbol} not found`);

        const buyQuery = new Query(JSON.parse(get(rule, 'strategy.in.query', null)));
        const sellQuery = new Query(JSON.parse(get(rule, 'strategy.out.query', null)));
        assert(buyQuery.__criteria || sellQuery.__criteria, `No strategy found for rule ${rule._id}`);

        let trade = trades.find(({ ruleId }) => rule._id.equals(ruleId));
        const lastOrder = orderId && (user.orders.find(({ id }) => id === orderId) || await rh.getOrder(orderId, user));
        const currentPrice = quote.close;
        const isUptick = quote.close > quote.open;
        const isFilled = get(lastOrder, 'state') === 'filled';
        const isSell = get(lastOrder, 'side') === 'sell';
        const isBuy = get(lastOrder, 'side') === 'buy';
        const isRuleActive = isBuy && isFilled;
        const isRuleInactive = isSell && isFilled;

        /**
         * Trade management
         */
        if (isFilled) {
          // Last order is a buy and no trade has been initiated, create one
          if (isBuy && !trade) {
            trade = new Trade({
              rule: rule._id.toString(),
              user: user._id.toString(),
              buyPrice: Number(lastOrder.price),
            });

            promises.push(trade.save());
          }
          // Trade was finished by last sell order
          else if (isSell && trade && get(trade, 'completed') === false) {
            trade.set('completed', true);
            trade.set('sellPrice', Number(lastOrder.price));
            trade.set('date', new Date());

            if (trade.sellPrice > trade.buyPrice) {
              rule.positiveTrades = rule.positiveTrades + 1;
            } else {
              rule.negativeTrades = rule.negativeTrades + 1;
            }

            promises.push(trade.save());
            promises.push(rule.save());
          }
        }

        /**
         * BUY pattern
         */
        if (!isRuleActive && buyQuery.test(quote)) {
          // Cancel any pending order
          const isCancelled = await this.cancelOrder(lastOrder);
          assert(isCancelled, `Failed to cancel order ${orderId}. It maybe got filled while sending the request`);

          // Initially set risk value one half of its original value in the rule
          const riskValue = currentPrice - (currentPrice * ((risk.percentage * 0.5) / 100));
          const promise = this.placeOrder(user, numberOfShares, currentPrice, symbol, 'buy')
            .then(order => {
              rule.set('lastOrderId', order.id);
              rule.set('risk.value', riskValue);
              return rule.save();
            });

          promises.push(promise);
        }

        /**
         * SELL pattern
         */
        else if (!isRuleInactive) {
          const riskValue = get(rule, 'risk.value');
          const riskPriceReached = riskValue > currentPrice;

          // Stop loss reached or sell pattern matches, trigger sell
          if (riskPriceReached || sellQuery.test(quote)) {
            // Cancel any pending order
            const isCancelled = await this.cancelOrder(lastOrder);
            assert(isCancelled, `Failed to cancel order ${orderId}. It maybe got filled while sending the request`);

            // Sell 0.02% lower than market price to get an easier fill
            // Note: Test this. this may not be needed for high volume/liquid stocks like FB etc...
            const price = (currentPrice * 0.9998).toFixed(2).toString();
            const promise = this.placeOrder(user, numberOfShares, price, symbol, 'sell')
              .then(order => {
                rule.set('lastOrderId', order.id);
                return rule.save();
              });

            promises.push(promise);
          }
        }

        /**
         * Follow price logic
         */
        else if (get(trade, 'buyPrice') && get(rule, 'risk.followPrice') && isUptick) {
          const buyPrice = get(trade, 'buyPrice');
          const riskPercentage = get(rule, 'risk.percentage');
          const currentRiskValue = get(rule, 'risk.value');
          const realizedGainPerc = ((currentPrice - buyPrice) / buyPrice) * 100;

          // Gains are higher than half the risk taken
          if (realizedGainPerc > riskPercentage / 2) {
            const newRiskValue = getRiskFromPercentage(currentPrice, riskPercentage);
            // Increase risk value only if the new risk is higher
            if (newRiskValue > currentRiskValue) {
              rule.set('risk.value', newRiskValue);

              promises.push(rule.save());
            }
          }
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.debug({ error }, 'Error occurred during processFeeds execution');
    }
  }

  /**
   * Helper function to cancel last order ONLY if it exists
   * @param order
   * @returns {Promise.<*>}
   */
  cancelOrder(order) {
    const orderCancelled = Promise.resolve(true);
    const orderNotCancelled = Promise.resolve(false);

    if (get(order, 'cancel')) {
      console.debug(formatJSON(order, 0), 'Canceling order');
      return rh.postWithAuth(order.cancel)
        .then(() => orderCancelled)
        .catch(() => orderNotCancelled);
    }
    return orderCancelled;
  }

  /**
   * Helper function to place an order
   * @param user
   * @param quantity
   * @param price
   * @param symbol
   * @param side
   * @returns {*}
   */
  placeOrder(user, quantity, price, symbol, side) {
    const order = {
      account_id: this.account.id,
      quantity,
      price,
      symbol,
      side,
      time_in_force: 'gtc',
      type: 'limit',
      ref_id: uuid()
    };
    console.debug(formatJSON(order, 0), 'Placing order');
    return rh.placeOrder(user, order);
  }
}

module.exports = Engine;
