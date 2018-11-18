const { Rule } = require('./../../models');

module.exports = async (request, response) => {
  const rule = new Rule(request.body);

  await rule.save();

  response.status(201).send(rule);
};
