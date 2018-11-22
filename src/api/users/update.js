const { User } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  const user = await User.findById(id);

  if (!user) {
    response.status(404).send('Trade not found');
  }

  user.set(request.body);

  await user.save();

  response.status(200).send(user);
};
