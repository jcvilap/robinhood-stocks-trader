const { get, uniqBy, uniq, round, isString } = require('lodash');
const { Query } = require('mingo');

const { Trade, queries: { getActiveRules, getIncompleteTrades } } = require('../models');
const rh = require('../services/rhApiService');
const tv = require('../services/tvApiService');
const logger = require('../services/logService');
const {
  marketTimes,
  assert,
  parsePattern,
  getRiskFromPercentage,
  TEN_SECONDS,
  FIVE_SECONDS,
  FIVE_HOURS,
  TEN_MINUTES
} = require('../services/utils');

// Todo: move constants to `process.env.js`
const OVERRIDE_MARKET_CLOSE = false;

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
      await this.detectIntervalChange();

      setInterval(() => this.loadRulesAndAccounts(), TEN_SECONDS);
      setInterval(() => this.processFeeds(), FIVE_SECONDS);
    } catch (error) {
      logger.error(error);
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
    const { isMarketClosed } = marketTimes();

    if (!OVERRIDE_MARKET_CLOSE && isMarketClosed) {
      return;
    }

    // Fetch fresh rules
    this.rules = await getActiveRules();
    // Fetch fresh users
    this.users = uniqBy(this.rules.map(rule => ({ ...rule.user.toObject(), _id: rule.user._id.toString() })), '_id');

    // Store all user tokens for authentication
    const tokenPromises = this.users.map(user => {
      const userToken = this.userTokens.get(user._id.toString());

      // Refresh token only after 5 hours
      if (!userToken || (((new Date()) - new Date(userToken.date)) >= FIVE_HOURS)) {
        return rh.auth(user.brokerConfig)
          .then(token => {
            user.token = token;
            this.userTokens.set(user._id.toString(), { token, date: new Date() });
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
            this.userAccounts.set(user._id.toString(), { account, date: new Date() });
          });
      }

      // Append account
      user.account = userAccount.account;
      return null;
    }).filter(a => a);

    // Append rule orders by refId
    const orderPromises = this.rules.map(rule => {
      const user = this.users.find(({ _id }) => rule.user._id.equals(_id));
      return this.getRuleOrders(user, rule)
        .then(orders => rule.orders = orders);
    });

    await Promise.all(accountPromises.concat(orderPromises))
      .catch(error => logger.error(error));
  }

  async processFeeds() {
    try {
      const { isMarketClosed, secondsLeftToMarketClosed } = marketTimes();

      if (!OVERRIDE_MARKET_CLOSE && isMarketClosed) {
        return;
      }

      const symbols = uniq(this.rules.map(r => `${r.exchange}:${r.symbol}`));
      const [quotes, trades] = await Promise.all([tv.getQuotes(...symbols), getIncompleteTrades()]);
      const promises = [];

      this.rules.forEach(async rule => {
        const user = this.users.find(u => rule.user._id.equals(u._id));
        assert(user, `User ${rule.user._id} not found in rule ${rule._id}`);

        const orders = rule.orders || await this.getRuleOrders(user, rule);
        assert(orders, `Orders not found for rule ${rule._id}`);
        rule.orders = orders;

        const { lastOrderId, numberOfShares, symbol, holdOvernight } = rule;
        const lastOrder = lastOrderId
          ? (orders.find(({ id }) => id === lastOrderId) || await rh.getOrder(lastOrderId, user))
          : null;
        const lastFilledOrder = get(lastOrder, 'state') === 'filled'
          ? lastOrder
          : orders.find(({ state }) => state === 'filled');

        const quote = quotes.find(q => q.symbol === `${rule.exchange}:${rule.symbol}`);
        assert(quote, `Quote for ${rule.symbol} not found`);

        const buyQuery = new Query(parsePattern(get(rule, 'strategy.in.query'), quote));
        const sellQuery = new Query(parsePattern(get(rule, 'strategy.out.query'), quote));
        assert(buyQuery.__criteria || sellQuery.__criteria, `No strategy found for rule ${rule._id}`);

        let trade = trades.find(({ rule }) => rule._id.equals(rule));
        const price = quote.close;
        const isUptick = quote.close > quote.previous_close;
        const isSell = get(lastFilledOrder, 'side') === 'sell';
        const isBuy = get(lastFilledOrder, 'side') === 'buy';
        const riskValue = get(rule, 'risk.value');
        const riskPriceReached = riskValue > price;
        const commonOptions = { user, lastOrder, symbol, price, numberOfShares, rule };

        /**
         * Trade management.
         * Last order got filled, update trade
         */
        if (lastFilledOrder && lastFilledOrder === lastOrder) {
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
         * End of day is approaching (4PM EST), sell all shares in the last 30sec if rule is not holding overnight
         */
        if (secondsLeftToMarketClosed < 30 && !holdOvernight) {
          if (isBuy) {
            promises.push(this.placeOrder({
              ...commonOptions,
              side: 'sell',
              patternName: 'Sell before market is closed',
            }));
          }
          // Exit at this point
          return;
        }

        /**
         * BUY pattern
         */
        if ((isSell || !lastFilledOrder) && buyQuery.test(quote)) {
          promises.push(this.placeOrder({
            ...commonOptions,
            side: 'buy',
            patternName: get(rule, 'strategy.in.name'),
          }));
        }

        /**
         * SELL pattern
         */
        else if (isBuy && (riskPriceReached || sellQuery.test(quote))) {
          promises.push(this.placeOrder({
            ...commonOptions,
            side: 'sell',
            patternName: sellQuery.test(quote) ? get(rule, 'strategy.out.name') : 'Risk reached',
          }));
        }

        /**
         * Follow price logic
         */
        else if (isBuy && get(trade, 'buyPrice') && rule.risk.followPrice && isUptick) {
          const buyPrice = get(trade, 'buyPrice');
          const riskPercentage = rule.risk.percentage;
          const currentRiskValue = rule.risk.value;
          const realizedGainPerc = ((price - buyPrice) / buyPrice) * 100;

          // Gains are higher than half the risk taken
          if (realizedGainPerc > riskPercentage / 2) {
            const newRiskValue = getRiskFromPercentage(price, riskPercentage);
            // Increase risk value only if the new risk is higher
            if (newRiskValue > currentRiskValue) {
              rule.set('risk.value', newRiskValue);

              promises.push(rule.save());
            }
          }
        }
      });

      await Promise.all(promises).catch(error => logger.error(error));
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * Helper function to fetch orders associated with a rule
   * @note Move into a helper service
   * @param user
   * @param rule
   * @returns {Promise<PromiseLike | never>}
   */
  getRuleOrders(user, rule) {
    return rh.getOrders(user)
      .catch(error => logger.error(error))
      .then((orders = []) => orders
        .filter(o => isString(o.ref_id) && o.ref_id.endsWith(rule.refId)));
  }

  /**
   * Cancels pending orders and places sell order
   * @param side
   * @param user
   * @param patternName
   * @param lastOrder
   * @param symbol
   * @param price
   * @param numberOfShares
   * @param rule
   * @returns {Promise}
   */
  async placeOrder({ side, user, lastOrder, symbol, price, numberOfShares, rule, patternName }) {
    if (get(lastOrder, 'state') !== 'filled' && get(lastOrder, 'cancel')) {
      try {
        await rh.postWithAuth(user, lastOrder.cancel)
          .then(() => logger.orderCanceled({ ...lastOrder, symbol, name: rule.name }));
      } catch (error) {
        return;
      }
    }

    let finalPrice;
    if (side === 'buy') {
      // Buy 0.01% higher than market price to get an easier fill
      finalPrice = (Number(price) * 1.0001).toFixed(2).toString();
    } else {
      // Sell 0.01% lower than market price to get an easier fill
      finalPrice = (Number(price) * 0.9999).toFixed(2).toString();
    }

    const options = {
      account: get(user, 'account.url', null),
      quantity: numberOfShares,
      price: finalPrice,
      symbol,
      side,
      instrument: rule.instrumentUrl,
      time_in_force: 'gtc',
      type: 'limit',
      trigger: 'immediate',
      override_day_trade_checks: rule.overrideDayTradeChecks,
      ref_id: rule.UUID()
    };

    return rh.placeOrder(user, options)
      .then(order => {
        if (get(order, 'id')) {
          logger.orderPlaced({ symbol, price, patternName, ...order, name: rule.name });

          rule.set('lastOrderId', order.id);
          if (side === 'buy') {
            // Initially set risk value one half of its original value in the rule
            const riskValue = price - (price * ((get(rule, 'risk.percentage') * 0.5) / 100));
            rule.set('risk.value', riskValue);
          }

          return rule.save();
        }
      })
      .catch(error => logger.error(error));
  }

  /**
   * Awaits until a change in the quote's price is detected
   * @returns {Promise}
   */
  async detectIntervalChange() {
    let prices = null;
    let changeDetected = false;
    while (!changeDetected) {
      const symbols = uniq(this.rules.map(r => `${r.exchange}:${r.symbol}`));
      const quotes = await tv.getQuotes(...symbols);
      const currentPrices = quotes.map(quote => quote.close);

      if (!prices) {
        prices = currentPrices;
      }

      changeDetected = currentPrices !== prices;
    }
  }
}

module.exports = Engine;
