const { User } = require('./../../models');

module.exports = async (request, response) => {
  const user = new User(request.body);

  await user.save();

  response.status(201).send(user);
};
