const moment = require('moment');
const { isNumber } = require('lodash');
const crypto = require('crypto-js');
const logger = require('./logService');

const { APP_SECRET } = require('../config/env');
const marketTimesData = {};

/**
 * US Stock Market standard hours
 * Note: This function does not check for US holidays or after hours
 */
const marketTimes = (data) => {
  const today = moment().format('YYYY-MM-DD');

  if (data && !marketTimesData[today]) {
    marketTimesData[today] = {
      opensAt: moment(data.opens_at),
      closesAt: moment(data.closes_at),
      extendedOpensAt: moment(data.extended_opens_at),
      extendedClosesAt: moment(data.extended_closes_at),
      isMarketOpenToday: data.is_open,
      isMarketClosedToday: !data.is_open,
    };
  }

  const marketTimes = marketTimesData[today];
  const now = moment();

  marketTimes.secondsLeftToMarketClosed = marketTimes.isMarketOpenToday ?
    moment.duration(marketTimes.closesAt.diff(now)).asSeconds() : 0;
  marketTimes.secondsLeftToExtendedMarketClosed = marketTimes.isMarketOpenToday ?
    moment.duration(marketTimes.extendedClosesAt.diff(now)).asSeconds() : 0;
  marketTimes.isOpenNow = now.isAfter(marketTimes.opensAt) && now.isBefore(marketTimes.closesAt);
  marketTimes.isClosedNow = !marketTimes.isOpenNow;
  marketTimes.isExtendedOpenNow = now.isAfter(marketTimes.extendedOpensAt) && now.isBefore(marketTimes.extendedClosesAt);
  marketTimes.isExtendedClosedNow = !marketTimes.isExtendedOpenNow;

  return marketTimes;
};

const isMarketTimesLoaded = () => !!marketTimesData[moment().format('YYYY-MM-DD')];

/**
 * Calculates the percentage from the price
 * @param price
 * @param percentage
 * @param type
 */
const getValueFromPercentage = (price, percentage, type) => {
  if (!percentage) {
    return null;
  }

  const value = price * (percentage / 100);
  return type === 'risk' ? price - value : price + value;
};

/**
 * Calculates the percentage 'profit Percentage' from the 'price'
 * @example price = 100, profitPercentage = 1, risk value = 99
 * @param price
 * @param profitPercentage
 * @returns {number}
 */
const getProfitFromPercentage = (price, profitPercentage) => {
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
 * @param object
 * @param doNotMatchIfNull
 * @returns {Object}
 */
const parsePattern = (pattern = null, object, doNotMatchIfNull) => {
  if (!pattern) {
    // Non matching query
    return { __invalidField__: { $exists: doNotMatchIfNull } };
  }

  const regex = /{{.+?}}/g;
  if (pattern && pattern.match(regex)) {
    let result = pattern;
    Object.keys(object).forEach(key => {
      if (result.includes(`{{${key}}}`)) {
          const toBeReplaced = isNumber(object[key]) ? `"{{${key}}}"` : `{{${key}}}`;
          result = result.replace(toBeReplaced, object[key]);
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
      logger.error(message);
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
  getValueFromPercentage,
  encrypt,
  decrypt,
  parsePattern,
  assert,
  formatJSON,
  isMarketTimesLoaded,
  ONE_SECOND,
  FIVE_SECONDS,
  TEN_SECONDS,
  ONE_MINUTE,
  TEN_MINUTES,
  ONE_HOUR,
  FIVE_HOURS,
};
