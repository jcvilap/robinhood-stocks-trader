const { get, uniq } = require('lodash');
const { Query } = require('mingo');
const uuid = require('uuid/v1');

const {
  marketTimes,
  assert,
  formatJSON,
  ONE_MINUTE,
  FIVE_SECONDS,
  FIVE_HOURS,
  TEN_MINUTES
} = require('../services/utils');
const { Rule } = require('../models');
const rh = require('../services/rhApiService');
const tv = require('../services/tvApiService');

// Todo: move constants to `process.env.js`
const OVERRIDE_MARKET_CLOSE = true;

const getActiveRules = () => Rule
  .find({ enabled: true })
  .populate('user')
  .populate('strategy.in')
  .populate('strategy.out');

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

      setInterval(() => this.loadRulesAndAccounts(), ONE_MINUTE);
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
    const orderPromises = this.users.map(user =>
      rh.getOrders(user)
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
      const quotes = await tv.getQuotes(...symbols);

      this.rules.forEach(async rule => {
        const { lastOrderId: orderId, risk, numberOfShares, symbol } = rule;

        const user = this.users.find(u => u._id.equals(rule.user._id));
        assert(user, `User ${rule.user._id} not found in rule ${rule._id}`);

        const quote = quotes.find(q => q.symbol === `${rule.exchange}:${rule.symbol}`);
        assert(quote, `Quote for ${rule.symbol} not found`);

        const buyQuery = new Query(JSON.parse(get(rule, 'strategy.in.query', null)));
        const sellQuery = new Query(JSON.parse(get(rule, 'strategy.out.query', null)));
        assert(buyQuery.__criteria || sellQuery.__criteria, `No strategy found for rule ${rule._id}`);

        const lastOrder = orderId && (user.orders.find(({ id }) => id === orderId) || await rh.getOrder(orderId, user));
        const isRuleActive = get(lastOrder, 'side') === 'buy' && get(lastOrder, 'state') === 'filled';
        const innerPromises = [];

        if (!isRuleActive && buyQuery.test(quote)) {
          await this.cancelOrder(lastOrder);
          const currentPrice = quote.close;
          const riskValue = currentPrice - (currentPrice * ((risk.percent * 0.5) / 100));
          const promise = this.placeOrder(user, numberOfShares, currentPrice, symbol, 'buy')
            .then(order => {
              rule.set('lastOrderId', order.id);
              rule.set('risk.value', riskValue);
              return rule.save();
            });

          innerPromises.push(promise);
        }
        // Sell pattern
        else if (isRuleActive) {
          // I'm here


          const purchasePrice = Number(lastOrder.price);
          const overbought = RSI >= 70;
          // If limit not set, put a stop loss at -.5% of the original purchase price
          if (!this.limitSellPrice) {
            this.limitSellPrice = this.getLimitSellPrice(purchasePrice, { initial: true });
            return;
          }
          // Cancel a possible pending order
          await this.cancelOrder(lastOrder);
          // If stop loss hit, sell immediate
          if (currentPrice <= this.limitSellPrice) {
            // Sell 0.02% lower than market price to get an easier fill
            // Note: Test this. this may not be needed for high volume/liquid stocks like FB etc...
            const price = (currentPrice * 0.9998).toFixed(2).toString();
            return await this.placeOrder(position.quantity, price, symbol, 'sell');
          }
          // Increase limit sell price as the current price increases, do not move it if price decreases
          const newLimit = this.getLimitSellPrice(currentPrice, { overbought });
          if (newLimit > this.limitSellPrice) {
            this.limitSellPrice = newLimit;
          }
        }

        return Promise.all(innerPromises);
      });
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
    if (get(order, 'cancel')) {
      console.debug(formatJSON(order, 0), 'Canceling order');
      return rh.postWithAuth(order.cancel);
    }
    return Promise.resolve();
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

  /**
   * Calculates stop loss price based on rule config.
   * Note: On initialization and oversold indicator the stop loss percentage from the rule is
   * divided by two in order to minimize risk and maximize profits respectively
   * @param price
   * @param options
   * @returns {number}
   */
  getLimitSellPrice(price, options = {}) {
    const { initial, overbought } = options;
    const percentage = (initial || overbought) ? rule.riskPercentage / 2 : rule.riskPercentage;
    return price - (price * (percentage / 100));
  }
}

module.exports = Engine;
