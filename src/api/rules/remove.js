const { Rule } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  await Rule.deleteOne({ _id: id });

  response.status(201);
};
