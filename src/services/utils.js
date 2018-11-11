const moment = require('moment');

class Utils {
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
