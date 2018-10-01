const request = require('request-promise-native');
const { RBH_API_BASE, RH_CREDENTIALS } = require('../config/env');

const common = { json: true };
const TOKEN_REFRESH_INTERVAL = 18000000;

class RHService {
  constructor() {
    this.commonPrivate = { ...common, headers: {} };
  }

  /**
   * Authenticates against RB service and stores Authorization header for future requests
   * @returns {Promise}
   */
  auth() {
    const options = {
      ...common,
      method: 'POST',
      uri: `${RBH_API_BASE}/oauth2/token/`,
      form: {
        ...RH_CREDENTIALS,
        grant_type: 'password',
        scope: 'internal',
        expires_in: TOKEN_REFRESH_INTERVAL // 5h
      }
    };
    return request(options)
      .then(({ access_token, token_type }) => this.commonPrivate.headers.Authorization = `${token_type} ${access_token}`);
  }

  /**
   * Retrieves instrument by symbol
   * @param symbol
   * @returns {Promise}
   * @returns {PromiseLike<{results: *} | never> | Promise<{results: *} | never>}
   */
  getInstrumentBySymbol(symbol) {
    const options = {
      ...common,
      uri: `${RBH_API_BASE}/instruments/?symbol=${symbol}`,
    };
    return request(options)
      .then(({ results }) => results[0]);
  }

  /**
   * Retrieves instrument by id
   * @param id
   * @returns {Promise}
   */
  getInstrumentById(id) {
    const options = {
      ...common,
      uri: `${RBH_API_BASE}/instruments/${id}/`,
    };
    return request(options);
  }

  /**
   * Retrieves account user
   * @returns {Promise}
   */
  getUser() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/user/`,
    };
    return request(options);
  }

  /**
   * Retrieves a single order
   * @param id
   * @returns {Promise}
   */
  getOrder(id) {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/orders/${id}`,
    };
    return request(options);
  }

  /**
   * Retrieves all orders for account
   * @returns {Promise}
   */
  getOrders() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/orders/`,
    };
    return request(options)
      .then(({ results }) => results);
  }

  /**
   * Places a generic order
   * @param order
   * @returns {Promise}
   */
  placeOrder(order) {
    return this.postWithAuth(`${RBH_API_BASE}/orders/`, order);
  }

  /**
   * Retrieves RH main account
   * Note: Even though it seems like RH supports multiple accounts for a user, for now we will not...
   * @returns {Promise}
   */
  getAccount() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/accounts/`,
    };
    return request(options)
      .then(({ results }) => results[0]);
  }

  /**
   * Retrieves day trades count for account
   * @returns {Promise}
   */
  getDayTradeCount(accountNumber) {
    return this.getAccountResource(accountNumber, 'recent_day_trades')
      .then(({ equity_day_trades }) => equity_day_trades.length);
  }

  /**
   * Retrieves position based on account and instructions
   * @returns {Promise}
   */
  getPosition(accountNumber, instrumentId) {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/positions/${accountNumber}/${instrumentId}/`,
    };
    return request(options);
  }

  /**
   * Retrieves all positions for all accounts
   * @returns {Promise}
   */
  getPositions() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/positions/?nonzero=true`,
    };
    return request(options)
      .then(({ results }) => results);
  }

  /**
   * Get historical values for symbol
   * @param symbol
   * @returns {Promise}
   */
  getHistoricals(symbol) {
    return this.getWithAuth(`${RBH_API_BASE}/marketdata/historicals/${symbol}/?span=hour&interval=15second&bounds=24_7`)
      .then(({ historicals = [] }) => historicals);
  }

  /**
   * Get quote. Used for interval feed analysis
   * @param symbol
   * @returns {Promise}
   */
  getQuote(symbol) {
    return this.getWithAuth(`${RBH_API_BASE}/quotes/${symbol}/`);
  }

  /**
   * Generic GET request with authentication headers
   * @param uri
   * @returns {Promise}
   */
  getWithAuth(uri) {
    const options = {
      ...this.commonPrivate,
      uri,
    };
    return request(options);
  }

  /**
   * Generic POST request with authentication headers
   * @param uri
   * @param body
   * @param customOption
   * @returns {Promise}
   */
  postWithAuth(uri, body, customOption = {}) {
    const options = {
      ...this.commonPrivate,
      method: 'POST',
      uri,
      body,
      ...customOption,
    };
    return request(options);
  }

  /**
   * Private utility function to easier use of the RH API
   * @param accountNumber
   * @param resource
   * @private
   */
  getAccountResource(accountNumber, resource) {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/accounts/${accountNumber}/${resource}/`,
    };
    return request(options);
  }
}

module.exports = new RHService();
