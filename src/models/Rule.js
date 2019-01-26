const mongoose = require('mongoose');
const uuid = require('uuid/v1');
const crypto = require('crypto');

const Rule = new mongoose.Schema({
  /**
   * Rule name
   */
  name: { type: String, required: true },
  /**
   * Stock symbol
   * @example 'SNAP'
   */
  symbol: { type: String, required: true, index: true },
  /**
   * Market exchange
   * @example 'NYSE'
   */
  exchange: { type: String, required: true },
  /**
   * Override 3 day-trade per week US rule
   */
  overrideDayTradeChecks: { type: Boolean, default: false },
  /**
   * Instrument in RB
   */
  instrumentId: { type: String, required: true },
  instrumentUrl : { type: String, required: true },
  /**
   * User id
   */
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  /**
   * Reference uuid to give the broker. User to filter orders
   */
  refId: { type: String, index: { unique: true } },
  /**
   * Number of shares to trade
   */
  numberOfShares: { type: Number, required: true },
  /**
   * Rule enabled flag
   */
  enabled: { type: Boolean, index: true },
  /**
   * Risk management
   */
  risk: {
    /**
     * If true, the limit risk will follow the price, else, it will stay
     * as a getRiskPercentage of the initial value
     */
    followPrice: { type: Boolean, default: true },
    /**k
     * Percentage of the initial value to risk off
     */
    percentage: { type: Number, default: 1 },
  },
  /**
   * Whether to hold the stock overnight or sell all shares before market closes
   */
  holdOvernight: { type: Boolean, default: false },
  strategy: {
    /**
     * Pattern to enter a trade
     */
    in: { type: mongoose.Schema.Types.ObjectId, ref: 'Pattern' },
    /**
     * Pattern to exit a trade
     */
    out: { type: mongoose.Schema.Types.ObjectId, ref: 'Pattern' },
  }
}, { versionKey: false });

// region HOOKS
Rule.post('save', async function(doc) {
  if (!doc.refId) {
    doc.set('refId', crypto.randomBytes(6).toString('hex'));

    await doc.save();
  }
});
// endregion

// region METHODS
/**
 * Generates UUID bound to rule
 * @return {string|null}
 */
Rule.methods.UUID = function() {
  if (this.refId) {
    const uuidParts = uuid().toString().split('-');
    const lastIndex = uuidParts.length - 1;
    uuidParts[lastIndex] = this.refId;

    return uuidParts.join('-');
  }

  return null;
};
// endregion

// region INDEXES
Rule.index(
  { symbol: 1, 'strategy.in': 1 },
  { name: 'unique_symbol_strategy_in', unique: true },
);
// endregion

module.exports = mongoose.model('Rule', Rule);
