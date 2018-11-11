const request = require('request-promise-native');
const { TV_API_BASE } = require('../config/env');

class TVService {
  /**
   * Retrieves symbol
   * @returns {Promise}
   */
  getQuote(symbol) {
    return this.getQuotes(symbol)
      .then(data => data[0]);
  }

  /**
   * Retrieves symbols' close price and RSI 14 indicator
   * Note: this API updates its data with every 10secs
   * @returns {Promise}
   */
  getQuotes(...symbols) {
    const options = {
      json: true,
      method: 'POST',
      uri: `${TV_API_BASE}/america/scan`,
      form: JSON.stringify({
        symbols: {
          tickers: [...symbols]
        },
        columns: ['RSI|1', 'close']
      })
    };

    return request(options)
      .then(({ data }) => data.map(s => ({
        symbol: s.s,
        rsi: s.d[0],
        close: s.d[1]
      })));
  }
}

module.exports = new TVService();
