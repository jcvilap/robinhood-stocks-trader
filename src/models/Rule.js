const mongoose = require('mongoose');

const Rule = new mongoose.Schema({
  /**
   * Stock symbol
   * @example 'SNAP'
   */
  symbol: {type: String, required: true, index: true},
  /**
   * Market exchange
   * @example 'NYSE'
   */
  exchange: {type: String, required: true},
  /**
   * Instrument id in RB
   */
  instrumentId: {type: String, required: true},
  /**
   * User id
   */
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  /**
   * Last filled order id
   */
  lastOrderId: {type: String},
  /**
   * Number of shares to trade
   */
  numberOfShares: {type: Number, required: true},
  /**
   * Number of winning trades
   */
  negativeTrades: {type: Number, default: 0},
  /**
   * Number of losing trades
   */
  positiveTrades: {type: Number, default: 0},
  /**
   * Rule enabled flag
   */
  enabled: {type: Boolean, index: true},
  /**
   * Risk management
   */
  risk: {
    /**
     * If true, the limit risk will follow the price, else, it will stay
     * as a getRiskPercentage of the initial value
     */
    followPrice: Boolean,
    /**
     * Percentage of the initial value to risk off
     */
    getRiskPercentage: Number,
    /**
     * Current limit calculate value(stock price)
     */
    value: Number,
  },
  strategy: {
    /**
     * Pattern to enter a trade
     */
    in: {type: mongoose.Schema.Types.ObjectId, ref: 'Pattern'},
    /**
     * Pattern to exit a trade
     */
    out: {type: mongoose.Schema.Types.ObjectId, ref: 'Pattern'},
  }
});


module.exports = mongoose.model('Rule', Rule);
