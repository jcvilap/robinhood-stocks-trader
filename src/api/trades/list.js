const { Trade } = require('./../../models');

module.exports = async (request, response) => {
  const { filter = '{}', page = '1', sort = '{ "id": "desc" }', max = '100' } = request.query;
  const searchQuery = {};
  const search = JSON.parse(filter);

  if (search.query) {
    searchQuery.$or = [
      { name: { $regex: search.query, $options: 'i' } },
    ];
  }

  const [docs, count] = await Promise.all([
    Trade
      .find(searchQuery)
      .limit(Number(max))
      .skip((Number(page) - 1) * max)
      .sort(JSON.parse(sort)),
    Trade
      .countDocuments(searchQuery)
  ]);

  response.set('X-Total-Count', count);
  response.status(200).send(docs);
};
