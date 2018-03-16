const {Rule, validateRule} = require('../models/Rule');
const Utils = require('../utils');
const rh = require('../services/rbhApiService');

class Engine {
  constructor() {

  }

  /**
   * Starts the engine. This happens only once at startup
   */
  async start() {
    await rh.auth();
    this.account = await rh.getAccount();
    this.user = await rh.getUser();
    this.portfolio = await rh.getAccountResource(this.account.account_number, 'portfolio');
    this.positions = await rh.getPositions();
    this.orders = await rh.getOrders();
    console.log(this.accounts);
    console.log(this.accounts);


    try {
      const [account, products, rules] = await Promise.all([
        this.client.getAccounts(),        // List of accounts with balances
        this.client.getProducts(),        // List of available USD products
        Rule.find(),                      // Rules stored in the DB
        this.client.cancelAllOrders()     // Cancel past limit orders
      ]);

      this.accounts = accounts;
      // Get a list of available USD based products for trading. For now, filter out non-USD products.
      // This will change, especially when trying to minimize tax deductions...
      this.products = products.filter(({quote_currency: s}) => s === 'USD');
      // Helper list of product ids
      this.productIds = this.products.map(({id}) => id);
      // Get stored rules
      this.rules = rules;

      // Initially sync rules and listen to ws channel
      this.syncRules();
      // Start websocket client and listen to the channel
      this.wsClient = this.createWSClient();

    } catch (error) {
      // For now just log the error. In the future we may want to try again reconnecting in 5 seconds or so
      console.error(error);
    }
  }
}

module.exports = Engine;