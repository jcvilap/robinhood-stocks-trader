const mongoose = require('mongoose');

const Pattern = new mongoose.Schema({
  query: { type: String, required: true },
  name: String,
}, { versionKey: false });

module.exports = mongoose.model('Pattern', Pattern);
