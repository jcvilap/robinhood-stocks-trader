const moment = require('moment');
const { isNumber } = require('lodash');
const crypto = require('crypto-js');

const { APP_SECRET } = require('../config/env');

/**
 * US Stock Market standard hours
 * Note: This function does not check for US holidays or after hours
 */
const marketTimes = () => {
  // Calculate hours in UTC
  const now = moment();
  const marketOpensAt = moment().utc().set({ hour: 14, minute: 30, second: 0 }); // 9:30 AM
  const marketClosesAt = moment().utc().set({ hour: 21, minute: 0, second: 0 }); // 4:00 PM
  const isWeekday = ![6, 7].includes(moment().isoWeekday());
  const isMarketOpen = moment().isBetween(marketOpensAt, marketClosesAt) && isWeekday;
  const isMarketClosed = !isMarketOpen;
  const secondsLeftToMarketClosed = moment.duration(marketClosesAt.diff(now)).asSeconds();

  return {
    marketOpensAt,
    marketClosesAt,
    isMarketOpen,
    isMarketClosed,
    secondsLeftToMarketClosed,
  };
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
 * @returns {Object}
 */
const parsePattern = (pattern = null, quote) => {
  if (!pattern) {
    // Non matching query
    return { __invalidField__: { $exists: true } };
  }

  const regex = /{{.+?}}/g;
  if (pattern && pattern.match(regex)) {
    let result = pattern;
    Object.keys(quote).forEach(key => {
      if (result.includes(`{{${key}}}`)) {
          const toBeReplaced = isNumber(quote[key]) ? `"{{${key}}}"` : `{{${key}}}`;
          result = result.replace(toBeReplaced, quote[key]);
      }
    });
    return JSON.parse(result);
  }

  return JSON.parse(pattern);
};

/**
 * Basic JSON formatter
 * @param json
 * @param spaces
 * @returns {string}
 */
const formatJSON = (json = {}, spaces = 2) => {
  const withStringify = JSON.stringify(json, null, spaces);
  const withToString = json.toString ? json.toString() : '';

  return withStringify !== '{}' ? withStringify : withToString;
};

/**
 * Basic assertion function with loggin capabilities
 * @param object
 * @param message
 * @param shouldLog
 */
const assert = (object, message, shouldLog = false) => {
  if (!object) {
    if (shouldLog) {
      log(message);
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
  getRiskFromPercentage,
  encrypt,
  decrypt,
  parsePattern,
  assert,
  formatJSON,
  ONE_SECOND,
  FIVE_SECONDS,
  TEN_SECONDS,
  ONE_MINUTE,
  TEN_MINUTES,
  ONE_HOUR,
  FIVE_HOURS,
};
