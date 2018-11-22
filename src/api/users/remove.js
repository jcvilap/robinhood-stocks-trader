const { User } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  await User.deleteOne({ _id: id });

  response.status(201);
};
