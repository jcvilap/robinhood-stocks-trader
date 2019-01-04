const { IncomingWebhook } = require('@slack/client');
const moment = require('moment');
const { isString } = require('lodash');
const { formatJSON } = require('./utils');

const { SLACK_LOG_ERROR_WEBHOOK_URL, SLACK_LOG_OTHER_WEBHOOK_URL } = require('../config/env');

class LogService {
  constructor() {
    this.errorLogger = new IncomingWebhook(SLACK_LOG_ERROR_WEBHOOK_URL);
    this.logger = new IncomingWebhook(SLACK_LOG_OTHER_WEBHOOK_URL);
  }

  error(toBeLogged, error = '') {
    const message = isString(toBeLogged) ? toBeLogged : formatJSON(toBeLogged, 0);
    const errorMsg = isString(error) ? error : formatJSON(error, 0);
    const finalMessage = error ? `*${message}* ${errorMsg}`.trim() : message;
    this.errorLogger.send(finalMessage);
    console.log(finalMessage);
  }

  orderPlaced({ symbol, side, patternName, created_at = new Date(), price }) {
    const message = `${symbol} | ${side} | ${patternName} | $${Number(price).toFixed(3)} | ${moment(created_at).format('mm/DD/YY h:mm:ssa')}`;
    this.logger.send(`:rocket: *ORDER PLACED =>* ${message}`);
    console.log(`*ORDER PLACED =>* ${message}`);
  }

  orderCanceled({ symbol, side, patternName, date = new Date(), price }) {
    const message = `${symbol} | ${side} | $${Number(price).toFixed(3)} | ${moment(date).format('mm/DD/YY h:mm:ssa')}`;
    this.logger.send(`:skull: *ORDER CANCELLED =>* ${message}`);
    console.log(`*ORDER CANCELLED =>* ${message}`);
  }
}

module.exports = new LogService();
