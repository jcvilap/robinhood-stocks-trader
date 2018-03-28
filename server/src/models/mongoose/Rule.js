const mongoose = require('mongoose');
const moment = require('moment');
const Utils = require('../../../utils');

const Rule = new mongoose.Schema({
  /**
   * User's account number
   */
  accountNumber: String,
  /**
   * Stock symbol
   * @example 'FB'
   */
  symbol: String,
  /**
   * Stock instrument id and URL. These values are is specially useful when mapping the position to the symbol
   */
  instrumentId: String,
  instrumentUrl: String,
  /**
   * Last stock price
   */
  price: Number,
  /**
   * Number of shares bought
   * @readonly
   */
  size: {type: Number, default: 0},
  /**
   * Number of shares to buy or  sell
   */
  quantity: {type: Number, default: 0},
  /**
   * Time of the last stock price change
   */
  time: Date,
  /**
   * Current status of the rule. Possible values:
   *  idle - the Rule is turned off by user
   *  active - result of a BUY
   *  inactive - result of a SELL
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
   * Only triggers a SELL if status is 'active'
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
  /**
   * If true the last limit order will be cancelled, and a new limit order will be place based on the new price
   */
  shouldUpdateLimitOrder: Boolean,
  /**
   * If the rules should be run in extended hours
   */
  extendedHoursEnabled: Boolean
});

/**
 * Calculates all the dynamic fields on the rule
 * @param rule
 * @param quote
 * @param position
 */
const validateRule = (rule, quote = {}, position = {}, account = {}) => {
  const {isMarketOpen} = Utils.marketTimes();
  // Set update limit order flag to false initially
  rule.shouldUpdateLimitOrder = false;

  // Update price from quote
  rule.price = isMarketOpen ? quote.last_trade_price : quote.last_extended_hours_trade_price;
  rule.time = quote.updated_at;

  // Calculate number of shares to trade
  if (position.quantity) {
    rule.quantity = position.quantity;
  } else if (account.margin_balances){
    // Calculate limit orders at 5% above the market price in order to protect customers from overdraft
    rule.quantity = Math.floor(Number(account.margin_balances.unallocated_margin_cash) / (rule.price + rule.price * 0.05));
  }

  // Upwards movement
  if (rule.status === 'active' && (rule.high < rule.price || rule.high === 0)) {
    rule.high = rule.price;
    rule.riskPrice = rule.high - (rule.high * rule.riskPerc / 100);
    rule.stopLossPrice = rule.high - (rule.high * rule.stopLossPerc / 100);
    rule.riskPrice = Utils.precisionRound(rule.riskPrice, 2);
    rule.stopLossPrice = Utils.precisionRound(rule.stopLossPrice, 2);
    rule.shouldUpdateLimitOrder = true;
  }

  // Downwards movement
  else if (rule.status === 'inactive' && (rule.low > rule.price || rule.low === 0)) {
    rule.low = rule.price;
    rule.limitPrice = rule.low + (rule.low * rule.limitPerc / 100);
    rule.limitPrice = Utils.precisionRound(rule.limitPrice, 2);
    rule.shouldUpdateLimitOrder = true;
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