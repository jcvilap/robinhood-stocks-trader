const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { SALT_WORK_FACTOR } = require('../config/env');
const Utils = require('../services/utils');

const User = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  useExtendedHours: { type: Boolean, default: false },
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
}, { versionKey: false });

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

User.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
};

module.exports = mongoose.model('User', User);
