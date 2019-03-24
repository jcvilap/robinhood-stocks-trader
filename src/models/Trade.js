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
   * Risk quote price that could trigger a sale
   */
  riskValue: { type: Number, default: 0 },
  /**
   * Quote price that could trigger a sale to lock profits
   */
  profitValue: { type: Number },
  /**
   * User id
   */
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  /**
   * Id of the Rule executing the order
   */
  rule: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule', required: true, index: true },
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

Trade.pre('save', async function (next) {
  const trade = this;
  const { sellPrice, buyPrice, completed } = trade;

  if (completed) {
    trade.gainPercent = ((sellPrice - buyPrice)/buyPrice) * 100;
  }

  return next();
});

module.exports = mongoose.model('Trade', Trade);
