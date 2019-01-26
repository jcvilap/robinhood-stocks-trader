const jwt = require('jsonwebtoken');
const { APP_SECRET } = require('../../config/env');

function verifyJWTToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, APP_SECRET, (err, decodedToken) => {
      if (err || !decodedToken) {
        return reject(err);
      }
      resolve(decodedToken);
    });
  });
}

function createJWToken(details) {
  return jwt.sign({ id: details.user._id, role: details.user.role }, APP_SECRET, {
    expiresIn: details.expiresIn // 86400 -- 24 hours
  });
}

module.exports = {
  verifyJWTToken,
  createJWToken
};
