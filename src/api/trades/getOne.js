const { Trade } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  const trade = await Trade.findById(id);

  if (!trade) {
    response.status(404).send('Trade not found');
  }
  response.status(200).send(trade);
};
