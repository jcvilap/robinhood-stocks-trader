const { Rule } = require('./../../models');

module.exports = async (request, response) => {
  const { limit, skip, sort, search } = request.query;
  const searchQuery = {};

  if (search) {
    searchQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  const [docs, count] = await Promise.all([
    Rule
      .find(searchQuery)
      .limit(Number(limit))
      .skip(Number(skip))
      .sort(sort),
    Rule
      .countDocuments(searchQuery)
  ]);

  response.set('X-Total-Count', count);
  response.status(200).send(docs);
};
