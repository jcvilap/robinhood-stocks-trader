const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const SALT_WORK_FACTOR = 10;

const User = new mongoose.Schema({
  username: {type: String, required: true},
  password: { type: String, required: true},
  role: { type: String, required: true},
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

User.pre('save', function(next) {
  var user = this;

  if (!user.isModified('password')) return next();

  bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
    if (err) return next(err);
    bcrypt.hash(user.password, salt, function(err, hash) {
      if (err) return next(err);
      user.password = hash;
      next();
    });
  });
});

User.methods.comparePassword = function(candidatePassword, cb) {
  bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
    if (err) return cb(err);
    cb(null, isMatch);
  });
};

module.exports = mongoose.model('User', User);
