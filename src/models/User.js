const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto-js');
const { SALT_WORK_FACTOR, APP_SECRET } = require('../config/env');
const Utils = require('../services/utils');

const User = new mongoose.Schema({
  username: {type: String, required: true},
  password: {type: String, required: true},
  role: {type: String, required: true},
  brokerConfig: {
    username: String,
    password: String,
    client_id: String,
    name: String,
  },
  emailConfig: {
    enabled: String,
    service: String,
    username: String,
    password: String,
    toEmail: String,
  }
});

User.pre('save', async function (next) {
  const user = this;

  if (!user.isModified('password')
    && !user.isModified('brokerConfig.password')
    && !user.isModified('emailConfig.password')) {
    return next();
  }

  // User password will never be decrypted
  if (user.isModified('password')) {
    const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
    user.password = await bcrypt.hash(user.password, salt);
  }

  // Other app passwords need to be decrypted to provide in API auth
  if (user.isModified('brokerConfig.password')) {
    user.brokerConfig.password = Utils.encrypt(user.brokerConfig.password);
  }
  if (user.isModified('emailConfig.password')) {
    user.emailConfig.password = Utils.encrypt(user.emailConfig.password);
  }

  return next();
});

User.methods.comparePassword = function (candidatePassword, cb) {
  bcrypt.compare(candidatePassword, this.password, function (err, isMatch) {
    if (err) return cb(err);
    cb(null, isMatch);
  });
};

module.exports = mongoose.model('User', User);