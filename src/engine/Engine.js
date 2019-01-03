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
      const { isMarketClosed } = marketTimes();

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

        const { lastOrderId, risk, numberOfShares, symbol } = rule;
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
        const currentPrice = quote.close;
        const isUptick = quote.close > quote.open;
        const isSell = get(lastFilledOrder, 'side') === 'sell';
        const isBuy = get(lastFilledOrder, 'side') === 'buy';
        const riskValue = get(rule, 'risk.value');
        const riskPriceReached = riskValue > currentPrice;

        /**
         * Trade management.
         * Last order got filled, update trade
         */

        // NOTE FOR ME: on the only rule that is enabled I made the mistake to manually sell the
        // stock it bought. Therefore, it thinks that the rule has an active order. Fix for tomorrow:
        // Manually buy a share and leave this rule work for a while. Then continue debugging.

        // After this rule looks ok, try the other two rules individually before putting them all to work

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
         * BUY pattern
         */
        if ((isSell || !lastFilledOrder) && buyQuery.test(quote)) {
          const patternName = get(rule, 'strategy.in.name');
          // Cancel any pending order
          const isCancelled = await this.cancelOrder(user, lastOrder);
          assert(isCancelled, `Failed to cancel order ${get(lastOrder, 'id')}. It maybe got filled while sending the request`);

          // Initially set risk value one half of its original value in the rule
          const riskValue = currentPrice - (currentPrice * ((risk.percentage * 0.5) / 100));
          const promise = this.placeOrder(user, numberOfShares, currentPrice, symbol, 'buy', rule, patternName)
            .then(order => {
              if (get(order, 'id')) {
                rule.set('lastOrderId', order.id);
                rule.set('risk.value', riskValue);
                return rule.save();
              }
            });

          promises.push(promise);
        }

        /**
         * SELL pattern
         */
        else if (isBuy && (riskPriceReached || sellQuery.test(quote))) {
          const patternName = sellQuery.test(quote) ? get(rule, 'strategy.out.name') : 'Risk reached';
          // Cancel any pending order
          const isCancelled = await this.cancelOrder(lastOrder);
          assert(isCancelled, `Failed to cancel order ${get(lastOrder, 'id', '')}`);

          // Sell 0.02% lower than market price to get an easier fill
          // Note: Test this. this may not be needed for high volume/liquid stocks like FB etc...
          const price = (currentPrice * 0.9998).toFixed(2).toString();
          const promise = this.placeOrder(user, numberOfShares, price, symbol, 'sell', rule, patternName)
            .then(order => {
              rule.set('lastOrderId', order.id);
              return rule.save();
            });

          promises.push(promise);
        }

        /**
         * Follow price logic
         */
        else if (isBuy && get(trade, 'buyPrice') && rule.risk.followPrice && isUptick) {
          const buyPrice = get(trade, 'buyPrice');
          const riskPercentage = rule.risk.percentage;
          const currentRiskValue = rule.risk.value;
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

      await Promise.all(promises).catch(error => logger.error(error));
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * Helper function to cancel last order ONLY if it exists
   * @note Move into a helper service
   * @param user
   * @param order
   * @returns {Promise.<*>}
   */
  cancelOrder(user, order = {}) {
    const orderCancelled = Promise.resolve(true);
    const orderNotCancelled = Promise.resolve(false);

    if (get(order, 'cancel')) {
      return rh.postWithAuth(user, order.cancel)
        .then(() => {
          logger.orderCanceled(order);
          return orderCancelled;
        })
        .catch(error => {
          logger.error(error);
          return orderNotCancelled;
        });
    }
    return orderCancelled;
  }

  /**
   * Helper function to place an order
   * @note Move into a helper service
   * @param user
   * @param quantity
   * @param price
   * @param symbol
   * @param side
   * @param rule
   * @param patternName
   * @returns {*}
   */
  placeOrder(user, quantity, price, symbol, side, rule, patternName) {
    const options = {
      account: get(user, 'account.url', null),
      quantity,
      price: round(price, 2),
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
        logger.orderPlaced({ patternName, ...order });
        return order;
      })
      .catch(error => {
        logger.error(error);
        throw new Error(error);
      });
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
   * Awaits until a change in the quote's price is detected
   * @returns {Promise<void>}
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
