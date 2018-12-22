const moment = require('moment');
const crypto = require('crypto-js');
const { APP_SECRET } = require('../config/env');


/**
 * US Stock Market standard hours
 * Note: This function does not check for US holidays or after hours
 */
const marketTimes = () => {
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
};

const formatJSON = (json, spaces = 2) => {
  return JSON.stringify(json, null, spaces);
};

/**
 * Calculates the percentage 'riskPercentage' from the 'price'
 * @example price = 100, riskPercentage = 1, risk value = 99
 * @param price
 * @param riskPercentage
 * @param options
 * @returns {number}
 */
const getRiskFromPercentage = (price, riskPercentage, options = {}) => {
  const { initial, overbought } = options;
  const percentage = (initial || overbought) ? riskPercentage / 2 : riskPercentage;
  return price - (price * (percentage / 100));
};

const encrypt = (text) => {
  return crypto.AES.encrypt(text, APP_SECRET).toString();
};

const decrypt = (encrypted) => {
  const bytes = crypto.AES.decrypt(encrypted, APP_SECRET);
  return bytes.toString(crypto.enc.Utf8);
};

/**
 * Replaces quote values in pattern string and then parses the string into an object
 * @param pattern
 * @param quote
 * @returns {any}
 */
const parsePattern = (pattern = null, quote) => {
  const regex = /{{.+?}}/g;
  if (pattern && pattern.match(regex)) {
    let result = pattern;
    Object.keys(quote).forEach(key => {
      if (result.includes(`{{${key}}}`)) {
          result = result.replace(`{{${key}}}`, quote[key]);
      }
    });
    return JSON.parse(result);
  }

  return JSON.parse(pattern);
};

const assert = (object, message, sendEmail = false) => {
  if (!object) {
    if (sendEmail) {
      // todo, implement sendEmail functionality and send email with error here
    }

    throw new Error(message);
  }
};

/**
 * Time Constants
 * @type {number}
 */
const ONE_SECOND = 1000;
const FIVE_SECONDS = ONE_SECOND * 5;
const TEN_SECONDS = ONE_SECOND * 10;
const ONE_MINUTE = ONE_SECOND * 60;
const TEN_MINUTES = ONE_MINUTE * 10;
const ONE_HOUR = ONE_MINUTE * 60;
const FIVE_HOURS = ONE_HOUR * 5;

module.exports = {
  marketTimes,
  formatJSON,
  getRiskFromPercentage,
  encrypt,
  decrypt,
  parsePattern,
  assert,
  ONE_SECOND,
  FIVE_SECONDS,
  TEN_SECONDS,
  ONE_MINUTE,
  TEN_MINUTES,
  ONE_HOUR,
  FIVE_HOURS,
};
