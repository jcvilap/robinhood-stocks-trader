const moment = require('moment');

class Utils {
  /**
   * RSI(14) over one minute
   * Assumes passed data represents 1hr overall over 15 secs interval
   * @param historicals
   * @returns {number}
   */
  static calculateRSI(historicals = []) {
    const dataPoints = [];
    let avgGain = 0;
    let aveLoss = 0;
    let bucketMinute = null;

    // Get last 15 mins worth of data
    for (let i = historicals.length - 1; i > (historicals.length - 1) - (15 * 4); i--) {
      const minute = moment(historicals[i].begins_at).minute();
      if (bucketMinute !== minute) {
        dataPoints.push(Number(historicals[i].close_price));
        bucketMinute = minute;
      }
    }
    // Calculate averages
    for (let i = 0; i < 14; i++) {
      const ch = dataPoints[i] - dataPoints[i + 1];
      if (ch >= 0) {
        avgGain += ch;
      } else {
        aveLoss -= ch;
      }
    }
    avgGain /= 14;
    aveLoss /= 14;

    // Calculate RS
    const RS = avgGain / aveLoss;
    // Return RSI
    return 100 - (100 / (1 + RS));
  }

  /**
   * US Stock Market standard hours
   * Note: This function does not check for US holidays or after hours
   **/
  static marketTimes() {
    // Calculate hours in UTC
    const marketOpensAt = moment().utc().set({ hour: 13, minute: 30, second: 0 }); // 9:30 AM
    const marketClosesAt = moment().utc().set({ hour: 20, minute: 0, second: 0 }); // 4:00 PM
    const isWeekday = ![6, 7].includes(moment().isoWeekday());
    const isMarketOpen = moment().isBetween(marketOpensAt, marketClosesAt) && isWeekday;
    const isMarketClosed = !isMarketOpen;

    return {
      marketOpensAt,
      marketClosesAt,
      isMarketOpen,
      isMarketClosed,
    };
  }

  /**
   * Calculates the stock quantity based on price and amount
   * @param quotePrice
   * @param amount
   * @param percentage
   * @returns {any}
   */
  static calculateQuantity(quotePrice, amount, percentage) {
    const _quotePrice = Number(quotePrice);
    const _balance = Number(amount);
    const _percentage = Number(percentage);
    const amountToInvest = _balance * (_percentage / 100);
    const result = amountToInvest / _quotePrice;
    return result > 1 ? result.toFixed(0).toString() : 0;
  }

  static formatJSON(json, spaces = 2) {
    return JSON.stringify(json, null, spaces)
  }
}

module.exports = Utils;
