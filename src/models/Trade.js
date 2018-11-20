const mongoose = require('mongoose');

const Trade = new mongoose.Schema({
  /**
   * Id of the Rule executing the order
   */
  ruleId: {type: String, required: true},
  /**
   * Percentage result of the trade
   */
  realizedPercentage: {type: Number, required: true},
  /**
   * Date the trade was complete
   */
  date: {type: Date, required: true },
});

module.exports = mongoose.model('Trade', Trade);
