const { Trade } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  await Trade.deleteOne({ _id: id });

  response.status(201);
};
