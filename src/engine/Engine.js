const {get, uniq} = require('lodash');
const {Query} = require('mingo');
const uuid = require('uuid/v1');
const Utils = require('../services/utils');
const rh = require('../services/rhApiService');
const tv = require('../services/tvApiService');

// Todo: move constants to `process.env.js`
const OVERRIDE_MARKET_CLOSE = true;
const OVERRIDE_DAY_TRADES = false;
const OVERRIDE_RSI = false;
const TOKEN_REFRESH_INTERVAL = 18000000; // 5h
const RULES_REFRESH_INTERVAL = 10000; // 5h
const REFRESH_INTERVAL = 5000; // 5s

// Rules
const getRules = () => Promise.resolve([{
  _id: 'rule-object-id',
  symbol: 'SNAP',
  exchange: 'NYSE',
  instrumentId: '1e513292-5926-4dc4-8c3d-4af6b5836704',
  lastOrderId: 'a298f5e0-bbcf-4569-abbc-10130f0c4773',
  numberOfShares: 1,
  positiveTrades: 3,
  negativeTrades: 1,
  enabled: true,
  risk: {
    followPrice: true,
    percent: 1,
    value: 9,
  },
  strategy: {
    buy: oversold,
    sell: null,
  }
}]);

// Patterns
const oversold = {
  rsi: {$lt: 30},
  volume: {$gte: 1000000},
  diff: {$gt: 0}, // calculate as close - open
};

// Trades
const trades = [{
  ruleId: 'rule-object-id',
  realizedPercentage: -1,
  date: new Date(),
}];

class Engine {
  constructor() {
    this.account = null;
    this.limitBuyPrice = null;
    this.limitSellPrice = null;
    this.rules = null;
  }

  async start() {
    try {
      await rh.auth();
      const [account, rules] = await Promise.all([
        rh.getAccount(),
        getRules()
      ]);
      this.account = account;
      this.rules = rules;

      await this.processFeeds();

      setInterval(() => rh.auth(), TOKEN_REFRESH_INTERVAL);
      setInterval(async () => this.rules = await getRules(), RULES_REFRESH_INTERVAL);
      setInterval(async () => this.processFeeds(), REFRESH_INTERVAL);
    } catch (error) {
      console.error(error);
    }
  }

  async processFeeds() {
    try {
      const {isMarketClosed} = Utils.marketTimes();
      const symbols = uniq(this.rules.map(r => `${r.exchange}:${r.symbol}`));

      if (!OVERRIDE_MARKET_CLOSE && isMarketClosed) {
        return;
      }

      const [quotes, orders, account, rules] = await Promise.all([
        tv.getQuotes(...symbols),
        rh.getOrders(),
        rh.getAccount(),
        getRules(),
      ]);

      let availableBalance = Number(get(account, 'cash', 0));

      Promise.all(rules.map(async rule => {
        const quote = quotes.find(q => q.symbol === `${rule.exchange}:${rule.symbol}`);
        const buyQuery = new Query(rule.query.buy);
        const sellQuery = new Query(rule.query.sell);
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
