const { Rule } = require('./../../models');

module.exports = async (request, response) => {
  const ids = request.body;

  await Rule.deleteMany({ _id: { $in: ids}});

  response.status(201).send({
    statusText: 'OK'
  });
};
