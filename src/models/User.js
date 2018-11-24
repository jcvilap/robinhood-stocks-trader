const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const SALT_WORK_FACTOR = 10;

const User = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
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

  const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);

  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, salt);
  }

  if (user.isModified('brokerConfig.password')) {
    user.brokerConfig.password = await bcrypt.hash(user.brokerConfig.password, salt);
  }

  if (user.isModified('emailConfig.password')) {
    user.emailConfig.password = await bcrypt.hash(user.emailConfig.password, salt);
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
