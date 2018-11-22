const { User } = require('../../models');
const { createJWToken } = require('./auth');

module.exports = async (request, response) => {

  const { username, password } = request.body;

  await User.findOne({username}, (err, user) => {
    if(err) {
      throw err;
    }
    user.comparePassword(password, (error, isMatch) => {
      if(error) throw error;
      if(isMatch) {
        const token = createJWToken({user, expiresIn: 86400});
        response.status(200).send({token});
      } else {
        response.status(401).send({message: 'Authentication failed'});
      }
    });
  });
};
