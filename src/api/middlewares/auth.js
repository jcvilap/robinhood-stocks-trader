const jwt = require('jsonwebtoken');
const { JWT } = require('../../config/env');

function verifyJWTToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT.secret, (err, decodedToken) => {
      if (err || !decodedToken) {
        return reject(err);
      }
      resolve(decodedToken);
    });
  });
}

function createJWToken(details) {
  return jwt.sign({ id: details.user._id }, JWT.secret, {
    expiresIn: details.expiresIn // 86400 -- 24 hours
  });
}

module.exports = {
  verifyJWTToken,
  createJWToken
};
