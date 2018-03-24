const {Rule, validateRule} = require('../models/Rule');
const Utils = require('../utils');
const rh = require('../services/rbhApiService');

class Engine {
  constructor() {
    this.account = null;
    this.positions = null;
    this.limitOrders = null;
    this.rules = null;
    this.poll = null;

    this.applyRules = this.applyRules.bind(this);
  }

  /**
   * Starts the engine. This happens only once at startup, steps are:
   * 1 - Authenticate user
   * 2 - Get user account, non zero positions and rules
   * 3 - For each rule
   *    *
   */
  async start() {
    try {
      // Authenticate
      await rh.auth();

      // Get account and positions
      const [account, positions] = await Promise.all([rh.getAccount(), rh.getPositions()]);
      this.account = account;
      this.positions = positions;

      // Get account rules
      this.rules = await Rule.find({accountNumber: this.account.account_number});

      // Note: remove when UI is ready for creating rules....
      // For now if no rules are found, create a new default rule for Netflix
      if (!this.rules.length) {
        const rule = new Rule({
          accountNumber: this.account.account_number,
          symbol: 'NFLX',
          instrumentId: '81733743-965a-4d93-b87a-6973cb9efd34',
          instrumentUrl: 'https://api.robinhood.com/instruments/81733743-965a-4d93-b87a-6973cb9efd34/'
        });
        this.rules = [await rule.save()];
      }

      // Kick off the analysis logic and run it every 5 seconds
      this.poll = setInterval(this.applyRules, 5000);
    } catch (error) {
      // For now just log the error. In the future we may want to try again reconnecting in 5 seconds or so
      console.error(error);
    }
  }

  /**
   * Main algorithm that updates limits based on the rules.
   * For now and until the portfolio is below 25k, let's run
   * only if there are no day-trades
   */
  async applyRules() {
    if (this.status === 'idle') {
      return clearInterval(this.poll);
    }

    try {
      const [quotes, dayTradeCount, limitOrders] = Promise.all([
        rh.getOrders(),
        rh.getQuotes(this.rules.map(r => r.symbol)),
        rh.getDayTradeCount(this.account.account_number),
      ]);

      if (!dayTradeCount) {
        this.rules.forEach(async (rule, index) => {
          const position = this.positions.find(p => p.instrument === rule.instrumentUrl);
          const quote = quotes.find(q => q.symbol === rule.symbol);
          const order = limitOrders.find(({id}) === rule.limitOrderId);

          // Update rule
          rule = validateRule(rule, quote, position);
          if (rule.shouldUpdateLimitOrder) {
            // Cancel previous order if found
            if (order) {
              const {state, cancel} = await rh.cancelOrder(order.id);
              // If cancel is no null, post to this url to cancel the order
              if (state !== 'cancelled' && cancel) {
                await rh.postWithAuth(cancel);
              }
            }
            // Check day trades
            if (rule.quantity < 3) {
              const orderOptions = {
                account: this.account.url,
                instrument: rule.instrumentUrl,
                symbol: rule.symbol,
                quantity: rule.quantity,
                type: 'limit',
                time_in_force: 'gtc',
                trigger: 'stop',
                extended_hours: true,
                override_day_trade_checks: false,
                override_dtbp_checks: false
              };
              // Rule active
              if (rule.quantity > 0) {
                options.price = rule.stopLossPrice;
                options.stop_price = rule.stopLossPrice;
                options.side = 'sell';
              }
              // Rule inactive
              else {
                options.price = rule.limitPrice;
                options.stop_price = rule.limitPrice;
                options.side = 'buy';
              }
              // Post new order
              const newOrder =  await rh.placeOrders(orderOptions);
              if (newOrder.state === 'confirmed') {
                rule.limitOrderId = newOrder.id;
                rule.time = newOrder.created_at;
              }
            }
          }

          // Maintain order collection up to date
          this.rules[index] = await rule.save();
        });
      }
    } catch (error) {
      // For now just log the error. In the future we may want to try again reconnecting in 5 seconds or so
      console.error(error);
    }
  }
}

module.exports = Engine;