const { Pattern } = require('./../../models');

module.exports = async (request, response) => {
  const { id } = request.params;

  await Pattern.deleteOne({ _id: id });

  response.status(201).send({
    statusText: 'OK'
  });
};
