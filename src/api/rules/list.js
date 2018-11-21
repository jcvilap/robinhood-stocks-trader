const { Rule } = require('./../../models');

module.exports = async (request, response) => {
  const { filter, page = '1', sort = '{ "id": "desc" }', max = '1' } = request.query;
  const searchQuery = {};
  const search = JSON.parse(filter);

  if (search.query) {
    searchQuery.$or = [
      { name: { $regex: search.query, $options: 'i' } },
    ];
  }

  const [docs, count] = await Promise.all([
    Rule
      .find(searchQuery)
      .limit(Number(max))
      .skip((Number(page) - 1) * max)
      .sort(JSON.parse(sort)),
    Rule
      .countDocuments(searchQuery)
  ]);

  response.set('X-Total-Count', count);
  response.status(200).send(docs);
};
