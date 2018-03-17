const {Rule, validateRule} = require('../models/Rule');
const Utils = require('../utils');
const rh = require('../services/rbhApiService');

class Engine {
  constructor() {
    this.account = null;
    this.positions = null;
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
   * Main algorithm that makes desicions based on the rules
   */
  async applyRules() {
    if (this.status === 'idle') {
      return clearInterval(this.poll);
    }

    try {
      const quotes = await rh.getQuotes(this.rules.map(r => r.symbol));
      this.rules.forEach(rule => {
        const position = this.positions.find(p => p.instrument.includes(rule.instrumentId));
        const quote = quotes.find(q => q.symbol === rule.symbol);
        const numberOfShares = Number(position.quantity);
        // Rule active
        if (numberOfShares > 0) {

        }
        // Rule inactive
        else {

        }
      });
    } catch (e) {
      console.error(error);
    }
  }
}

module.exports = Engine;