const { Trade } = require('./../../models');

module.exports = async (request, response) => {
  const trade = new Trade(request.body);

  await trade.save();

  response.status(201).send(trade);
};
