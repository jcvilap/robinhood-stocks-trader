const mongoose = require('mongoose');
const Utils = require('../utils');

const Rule = new mongoose.Schema({
  /**
   * Stock symbol
   * @example 'FB'
   */
  symbol: String,
  /**
   * Stock instrument id. This value is specially useful when mapping the position to the symbol
   */
  instrumentId: String,
  /**
   * Price per share
   */
  price: Number,
  /**
   * Number of shares bought or sold
   * @readonly
   */
  size: {type: Number, default: 0},
  /**
   * Time of the last stock price change
   */
  time: Number,
  /**
   * Current status of the rule. Possible values:
   *  idle - the Rule is turned off by user
   *  bought - result of a BUY
   *  sold - result of a SELL
   *  pending - pending BUY or SELL transaction
   */
  status: {type: String, default: 'idle'},
  /**
   * Flag indicating if trading is halted on the stock
   */
  tradingHalted: Boolean,
  /**
   * Percentage that this rule represents of the entire account funds
   * @example 100%
   */
  portfolioDiversity: {type: Number, default: 100},
  /**
   * Highest stock price since the last transaction
   */
  high: {type: Number, default: 0},
  /**
   * Price per share that, if reached, will trigger a SELL
   * Only triggers a SELL if status is 'bought'
   * @example 1%
   */
  stopLossPerc: {type: Number, default: .1},
  stopLossPrice: Number,
  /**
   * Lowest stock price since the last transaction
   */
  low: {type: Number, default: 0},
  /**
   * Price per share that, if reached, will trigger a BUY
   * Only triggers a BUY if status is 'sold'
   * @example 1%
   */
  limitPerc: {type: Number, default: .05},
  limitPrice: Number,
  /**
   * Price per share that, if reached, will trigger a market SELL and will put the rule on 'idle' state
   */
  riskPerc: {type: Number, default: 10},
  riskPrice: Number,
  /**
   * Order id of active BUY or SELL limit order
   */
  limitOrderId: String,
});

/**
 * Calculates all the dynamic fields on the rule
 * @param rule
 */
const validateRule = (rule) => {
  // Upwards movement
  if (rule.status === 'bought' && (rule.high < rule.price || rule.high === 0)) {
    rule.high = rule.price;
    rule.riskPrice = rule.high - (rule.high * rule.riskPerc / 100);
    rule.stopLossPrice = rule.high - (rule.high * rule.stopLossPerc / 100);
    rule.riskPrice = Utils.precisionRound(rule.riskPrice, 2);
    rule.stopLossPrice = Utils.precisionRound(rule.stopLossPrice, 2);
  }

  // Downwards movement
  if (rule.status === 'sold' && (rule.low > rule.price || rule.low === 0)) {
    rule.low = rule.price;
    rule.limitPrice = rule.low + (rule.low * rule.limitPerc / 100);
    rule.limitPrice = Utils.precisionRound(rule.limitPrice, 2);
  }
};

/**
 * Before persisting a rule, update docinfo
 */
Rule.pre('save', function preSave(next) {
  const rule = this;
  const now = new Date().toISOString();

  // Update doc info
  rule.set('docinfo.updatedAt', now);
  if (!rule.get('docinfo.createdAt')) {
    rule.set('docinfo.createdAt', now);
  }

  // Calculate fields
  validateRule(rule);

  next();
});

module.exports = {
  Rule: mongoose.model('Rule', Rule),
  validateRule
};