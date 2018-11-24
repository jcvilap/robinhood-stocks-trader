const mongoose = require('mongoose');

const Rule = new mongoose.Schema({
  /**
   * Stock symbol
   * @example 'SNAP'
   */
  symbol: {type: String, required: true},
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
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  /**
   * Last filled order id
   */
  lastOrderId: {type: String, required: true},
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
  enabled: Boolean,
  /**
   * Risk management
   */
  risk: {
    /**
     * If true, the limit risk will follow the price, else, it will stay
     * as a percentage of the initial value
     */
    followPrice: Boolean,
    /**
     * Percentage of the initial value to risk off
     */
    percent: Number,
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
