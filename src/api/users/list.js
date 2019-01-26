const { User } = require('./../../models');

module.exports = async (request, response) => {
  const { filter = '{}', page = '1', sort = '{ "id": "desc" }', max = '100' } = request.query;
  const searchQuery = {};
  const search = filter ? JSON.parse(filter) : {};

  if (search.query) {
    searchQuery.$or = [
      { name: { $regex: search.query, $options: 'i' } },
    ];
  }

  const [docs, count] = await Promise.all([
    User
      .find(searchQuery)
      .limit(Number(max))
      .skip((Number(page) - 1) * max)
      .sort(JSON.parse(sort)),
    User
      .countDocuments(searchQuery)
  ]);

  response.set('X-Total-Count', count);
  response.status(200).send(docs);
};
