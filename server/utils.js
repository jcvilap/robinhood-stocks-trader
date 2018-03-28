const moment = require('moment');

class Utils {
  static precisionRound(number, precision) {
    const factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
  }

  static marketTimes() {
    // Calculate hours in UTC
    const extendedHoursOpen = moment().utc().set({hour: 13, minute: 0, second: 0});    // 9:00 AM
    const marketOpen = moment().utc().set({hour: 13, minute: 30, second: 0});          // 9:30 AM
    const marketClosed = moment().utc().set({hour: 20, minute: 0, second: 0});         // 4:00 PM
    const extendedHoursClosed = moment().utc().set({hour: 22, minute: 0, second: 0});  // 6:00 PM
    const isMarketOpen = moment().isBetween(marketOpen, marketClosed);
    const isExtendedHours = !isMarketOpen && moment().isBetween(extendedHoursOpen, extendedHoursClosed);
    const isMarketClosed = !isMarketOpen && !isExtendedHours;
    return {
      extendedHoursOpen,
      marketOpen,
      marketClosed,
      extendedHoursClosed,
      isMarketOpen,
      isExtendedHours,
      isMarketClosed
    };
  }
}

module.exports = Utils;