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

/**
 * Calculates the stock quantity based on price and amount
 * @param quotePrice
 * @param amount
 * @param percentage
 * @returns {any}
 */
const calculateQuantity = (quotePrice, amount, percentage) => {
  const _quotePrice = Number(quotePrice);
  const _balance = Number(amount);
  const _percentage = Number(percentage);
  const amountToInvest = _balance * (_percentage / 100);
  const result = amountToInvest / _quotePrice;
  return result > 1 ? result.toFixed(0).toString() : 0;
};

const formatJSON = (json, spaces = 2) => {
  return JSON.stringify(json, null, spaces);
};

const encrypt = (text) => {
  return crypto.AES.encrypt(text, APP_SECRET).toString();
};

const decrypt = (encrypted) => {
  const bytes = crypto.AES.decrypt(encrypted, APP_SECRET);
  return bytes.toString(crypto.enc.Utf8);
};

const assert = (object, message, sendEmail = false) => {
  if (!object) {
    if(sendEmail) {
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
  calculateQuantity,
  marketTimes,
  formatJSON,
  encrypt,
  decrypt,
  assert,
  ONE_SECOND,
  FIVE_SECONDS,
  TEN_SECONDS,
  ONE_MINUTE,
  TEN_MINUTES,
  ONE_HOUR,
  FIVE_HOURS,
};
