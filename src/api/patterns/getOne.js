const { Pattern } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  const pattern = await Pattern.findById(id);

  if (!pattern) {
    response.status(404).send('Pattern not found');
  }
  response.status(200).send(pattern);
};
