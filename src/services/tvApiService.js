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
        columns: ['RSI|1', 'close|1', 'open|1', 'MACD.macd|1', 'MACD.signal|1', 'EMA30|1', 'volume|1']
      })
    };

    return request(options)
      .then(({ data }) => data.map(s => ({
        symbol: s.s,
        rsi: Number(s.d[0]),
        close: Number(s.d[1]),
        open: Number(s.d[2]),
        diff: Number(s.d[1]) - Number(s.d[2]),
        macd: Number(s.d[3]),
        macdSignal: Number(s.d[4]),
        ema: Number(s.d[5]),
        volume: Number(s.d[6]),
      })));
  }
}

module.exports = new TVService();
