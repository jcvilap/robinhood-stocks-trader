const { Pattern } = require('./../../models');

module.exports = async (request, response) => {
  const pattern = new Pattern(request.body);

  await pattern.save();

  response.status(201).send(pattern);
};
