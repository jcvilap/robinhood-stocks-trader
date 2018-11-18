const { Rule } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  const rule = await Rule.findById(id);

  if (!rule) {
    response.status(404).send('Rule not found');
  }

  rule.set(request.body);

  await rule.save();

  response.status(200).send(rule);
};
