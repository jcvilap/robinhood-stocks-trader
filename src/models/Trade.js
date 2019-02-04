const mongoose = require('mongoose');

const Trade = new mongoose.Schema({
  /**
   * Price used to enter the trade
   */
  buyPrice: { type: Number },
  buyOrderId: { type: String },
  buyDate: { type: Date },
  /**
   * Price used to exit the trade
   */
  sellPrice: { type: Number },
  sellOrderId: { type: String },
  sellDate: { type: Date },
  /**
   * Whether the trade has ended
   */
  completed: { type: Boolean, default: false, index: true },
  /**
   * Value that triggers a sale
   */
  riskValue: { type: Number, default: 0 },
  /**
   * User id
   */
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  /**
   * Id of the Rule executing the order
   */
  rule: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule', required: true },

  gainPercent: { type: Number },
}, { versionKey: false });

Trade.index(
  { rule: 1, completed: 1 },
  {
    name: 'unique_incomplete_trade_rule',
    unique: true,
    partialFilterExpression: { completed: false },
  }
);

module.exports = mongoose.model('Trade', Trade);
