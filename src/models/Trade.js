const mongoose = require('mongoose');

const Trade = new mongoose.Schema({
  /**
   * Id of the Rule executing the order
   */
  rule: { type: mongoose.Schema.Types.ObjectId, ref: 'Rule', required: true },
  /**
   * Price used to enter the trade
   */
  buyPrice: { type: Number },
  /**
   * Price used to exit the trade
   */
  sellPrice: { type: Number },
  /**
   * Date the trade was complete
   */
  date: { type: Date },
  /**
   * Whether the trade has ended
   */
  completed: { type: Boolean, default: false, index: true },
  /**
   * User id
   */
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

module.exports = mongoose.model('Trade', Trade);
