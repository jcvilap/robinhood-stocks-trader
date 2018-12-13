const request = require('request-promise-native');
const { RBH_API_BASE } = require('../config/env');
const Utils = require('../services/utils');

const common = { json: true };
const TOKEN_REFRESH_INTERVAL = 18000000;

class RHService {
  /**
   * Authenticates against RB service and stores Authorization header for future requests
   * @returns {Promise}
   */
  async auth(config) {
    const options = {
      ...common,
      method: 'POST',
      uri: `${RBH_API_BASE}/oauth2/token/`,
      form: {
        ...config,
        password: Utils.decrypt(config.password),
        grant_type: 'password',
        scope: 'internal',
        expires_in: TOKEN_REFRESH_INTERVAL // 5h
      }
    };
    return request(options)
      .then(({ access_token, token_type }) => `${token_type} ${access_token}`);
  }

  /**
   * Retrieves instrument by symbol
   * @param symbol
   * @returns {Promise}
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
   * Retrieves all orders for account
   * @returns {Promise}
   */
  getOrders({ token }) {
    const options = {
      ...common,
      headers: {
        Authorization: token,
      },
      uri: `${RBH_API_BASE}/orders/`,
    };
    return request(options)
      .then(({ results }) => results);
  }

  /**
   * Retrieves order by id
   * @returns {Promise}
   */
  getOrder(id, { token }) {
    const options = {
      ...common,
      headers: {
        Authorization: token,
      },
      uri: `${RBH_API_BASE}/orders/${id}`,
    };
    return request(options);
  }

  /**
   * Places a generic order
   * @param user
   * @param order
   * @returns {Promise}
   */
  placeOrder(user, order) {
    return this.postWithAuth(user, `${RBH_API_BASE}/orders/`, order);
  }

  /**
   * Retrieves RH main account
   * Note: Even though it seems like RH supports multiple accounts for a user, for now we will not...
   * @returns {Promise}
   */
  getAccount({ token }) {
    const options = {
      ...common,
      headers: {
        Authorization: token,
      },
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
   * @param token
   * @param body
   * @param customOption
   * @returns {Promise}
   */
  postWithAuth({ token }, uri, body, customOption = {}) {
    const options = {
      ...common,
      headers: {
        Authorization: token,
      },
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
