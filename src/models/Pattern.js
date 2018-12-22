const mongoose = require('mongoose');

const Pattern = new mongoose.Schema({
  query: { type: String, required: true },
  name: String,
});

module.exports = mongoose.model('Pattern', Pattern);
