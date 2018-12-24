const { IncomingWebhook } = require('@slack/client');
const { isString, pick } = require('lodash');
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
    this.errorLogger.send(`*${message}* ${errorMsg}`);
    console.log(`*${message}* ${errorMsg}`);
  }

  orderPlaced(order) {
    const fields = ['id', 'fees', 'instrument', 'state', 'price', 'quantity', 'url'];
    const message = formatJSON(pick(order, fields), 0);
    this.logger.send(`:rocket: *ORDER PLACED =>* ${message}`);
    console.log(`*ORDER PLACED =>* ${message}`);
  }

  orderCanceled(order) {
    const fields = ['id', 'fees', 'instrument', 'state', 'price', 'quantity', 'url'];
    const message = formatJSON(pick(order, fields), 0);
    this.logger.send(`:skull: *ORDER CANCELLED =>* ${message}`);
    console.log(`*ORDER CANCELLED =>* ${message}`);
  }
}

module.exports = new LogService();
