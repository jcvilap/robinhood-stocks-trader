const request = require('request-promise-native');
const {RBH_API_BASE, RH_CREDENTIALS} = require('./../env');
const common = {json: true};

class RHService {
  constructor() {
    this.commonPrivate = {...common, headers: {}};
  }

  // =========================================
  // Public APIs
  // =========================================

  getQuotes(...symbols) {
    const options = {
      ...common,
      uri: `${RBH_API_BASE}/quotes/?symbols=${symbols}`
    };
    return request(options)
      .then(({results}) => results);
  }

  getInstrumentBySymbol(symbol) {
    const options = {
      ...common,
      uri: `${RBH_API_BASE}/instruments/?symbol=${symbol}`
    };
    return request(options);
  }

  getInstrumentById(id) {
    const options = {
      ...common,
      uri: `${RBH_API_BASE}/instruments/${id}/`
    };
    return request(options);
  }

  // =========================================
  // Private APIs
  // =========================================

  auth() {
    const options = {
      ...common,
      method: 'POST',
      uri: `${RBH_API_BASE}/api-token-auth/`,
      form: RH_CREDENTIALS
    };
    return request(options)
      .then(({token}) => this.commonPrivate.headers.Authorization = `Token ${token}`);
  }

  /**
   * Even though it seems like RH supports multiple accounts for a user, for now we will not...
   */
  getAccount() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/accounts/`
    };
    return request(options)
      .then(({results}) => results[0]);
  }

  getUser() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/user/`
    };
    return request(options);
  }

  getPositions() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/positions/?nonzero=true`
    };
    return request(options)
      .then(({results}) => results);
  }

  getOrders() {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/orders/?filter[state]=confirmed`
    };
    return request(options);
  }

  cancelOrder(id) {
    return this.postWithAuth(`${RBH_API_BASE}/orders/${id}/cancel/`)
      .then(({token}) => this.commonPrivate.headers.Authorization = `Token ${token}`);
  }

  getAccountResource(accountNumber, resource) {
    const options = {
      ...this.commonPrivate,
      uri: `${RBH_API_BASE}/accounts/${accountNumber}/${resource}/`
    };
    return request(options);
  }

  getDayTradeCount(accountNumber) {
   return this.getAccountResource(accountNumber, 'recent_day_trades')
     .then((recentDayTrades) => recentDayTrades.length);
  }

  postWithAuth(URL) {
    const options = {
      ...this.commonPrivate,
      method: 'POST',
      uri: URL,
      form: RH_CREDENTIALS
    };
    return request(options);
  }
}

module.exports = new RHService();