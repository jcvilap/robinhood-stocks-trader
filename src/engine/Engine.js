const {get, uniq} = require('lodash');
const {Query} = require('mingo');
const uuid = require('uuid/v1');
const Utils = require('../services/utils');
const {Rule} = require('../models');
const rh = require('../services/rhApiService');
const tv = require('../services/tvApiService');

// Todo: move constants to `process.env.js`
const OVERRIDE_MARKET_CLOSE = true;
const OVERRIDE_RSI = false;
const TOKEN_REFRESH_INTERVAL = 18000000; // 5h
const RULES_REFRESH_INTERVAL = 10000; // 5h
const REFRESH_INTERVAL = 5000; // 5s

const getActiveRules = () => Rule
  .find({enabled: true})
  .populate('user')
  .populate('strategy.in')
  .populate('strategy.out');

class Engine {
  constructor() {
    /**
     * This map will hold non persisted rule data such as auth tokens and risk limits
     * @type {Map<ObjectId, any>}
     */
    this.ruleMedataData = new Map();
    this.users = [];
    this.rules = [];
  }

  async start() {
    try {
      await this.loadRulesAndAccounts();
      await this.processFeeds();

      setInterval(() => rh.auth(), TOKEN_REFRESH_INTERVAL);
      setInterval(async () => this.loadRulesAndAccounts(), RULES_REFRESH_INTERVAL);
      setInterval(async () => this.processFeeds(), REFRESH_INTERVAL);
    } catch (error) {
      console.error(error);
    }
  }

  async loadRulesAndAccounts() {
    this.rules = await getActiveRules();
    this.users = uniq(this.rules.map(rule => rule.user.toObject()));

    // Get user tokens for authentication
    await Promise.all(this.users.map(user => rh.auth(user.brokerConfig)
      .then(token => user.token = token)));

    // Get user accounts user
    await Promise.all(this.users.map(user => rh.getAccount(user)
      .then(account => user.account = account)));
  }

  async processFeeds() {
    try {
      const {isMarketClosed} = Utils.marketTimes();

      if (!OVERRIDE_MARKET_CLOSE && isMarketClosed) {
        return;
      }

      const symbols = uniq(this.rules.map(r => `${r.exchange}:${r.symbol}`));
      const quotes = await tv.getQuotes(...symbols);

      Promise.all(this.rules.map(async rule => {
        const quote = quotes.find(q => q.symbol === `${rule.exchange}:${rule.symbol}`);
        const buyQuery = new Query(rule.strategy.in);
        const sellQuery = new Query(rule.strategy.out);


        const previousOrder = orders.find(({id}) => id === rule.orderId);
        const isRuleActive = previousOrder.side === 'buy' && previousOrder.state === 'filled';
        const innerPromises = [];

        // Purchase Pattern
        if (availableBalance && !isRuleActive && buyQuery.test(quote)) {
          innerPromises.push(this.cancelOrder(previousOrder));

          if (!rule.limitBuyPrice)
          // Price not longer oversold
            if (!OVERRIDE_RSI && RSI > 30) {
              this.limitBuyPrice = null;
              // Cancel order and exit
              return await this.cancelOrder(lastOrder);
            }
          // If limit not set, set it and exit until next tick
          if (!this.limitBuyPrice) {
            this.limitBuyPrice = currentPrice;
            return;
          }
          // Price went down and RSI is still below 30
          if (this.limitBuyPrice > currentPrice) {
            // Update limit
            this.limitBuyPrice = currentPrice;
            // Cancel last order, exit and wait
            return await this.cancelOrder(lastOrder);
          }
          // Price went up and above the limit price, this means the ticker could
          // be trying to go out of oversold, therefore buy here.
          if (this.limitBuyPrice < currentPrice) {
            // Cancel possible pending order
            await this.cancelOrder(lastOrder);
            // Buy 0.02% higher than market price to get an easier fill
            // Note: Test this. this may not be needed for high volume/liquid stocks like FB etc...
            const price = (currentPrice * 1.0002).toFixed(2).toString();
            // Get quantity based on portfolio diversity
            const quantity = Utils.calculateQuantity(price, availableBalance, rule.portfolioDiversity);
            if (!quantity) {
              console.debug(`Not enough balance to buy a share of: ${symbol}.`);
              return;
            }

            return await this.placeOrder(quantity, price, symbol, 'buy');
          }
        }
        // Sell pattern
        else if (investedBalance) {
          const purchasePrice = Number(lastOrder.price);
          const overbought = RSI >= 70;
          // If limit not set, put a stop loss at -.5% of the original purchase price
          if (!this.limitSellPrice) {
            this.limitSellPrice = this.getLimitSellPrice(purchasePrice, {initial: true});
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
          const newLimit = this.getLimitSellPrice(currentPrice, {overbought});
          if (newLimit > this.limitSellPrice) {
            this.limitSellPrice = newLimit;
          }
        }

        return Promise.all(innerPromises);
      }));
    } catch (error) {
      console.debug({error}, 'Error occurred during processFeeds execution');
    }
  }

  /**
   * Helper function to cancel last order ONLY if it exists
   * @param order
   * @returns {Promise.<*>}
   */
  cancelOrder(order) {
    if (get(order, 'cancel')) {
      console.debug(Utils.formatJSON(order, 0), 'Canceling order');
      return rh.postWithAuth(order.cancel);
    }
    return Promise.resolve();
  }

  /**
   * Helper function to place an order
   * @param quantity
   * @param price
   * @param symbol
   * @param side
   * @returns {*}
   */
  placeOrder(quantity, price, symbol, side) {
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
    console.debug(Utils.formatJSON(order, 0), 'Placing order');
    return rh.placeOrder(order);
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
    const {initial, overbought} = options;
    const percentage = (initial || overbought) ? rule.riskPercentage / 2 : rule.riskPercentage;
    return price - (price * (percentage / 100));
  }
}

module.exports = Engine;
