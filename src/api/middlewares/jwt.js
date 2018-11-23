const { verifyJWTToken } = require('./auth');

module.exports = async (request, response, next) => {
  const token = request.headers['authorization'];

  if(token) {
    try {
      const isValid = await verifyJWTToken(token);
      if(isValid) next();
      else {
        response.status(403).send({
          status: 403,
          statusText: 'unauthorized'
        });
      }
    } catch (e) {
      response.status(403).send({
        status: 403,
        statusText: 'authorization error'
      });
    }
  } else {
    response.status(403).send({
      status: 403,
      statusText: 'no token'
    });
  }

};
