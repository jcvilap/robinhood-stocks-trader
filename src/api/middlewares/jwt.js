const { verifyJWTToken } = require('./auth');

module.exports = async (request, response, next) => {
  const token = request.headers['authorization'];

  if(token) {
    await verifyJWTToken(token).then(() => {
      next();
    }).catch( () => {
      response.status(403).send({
        status: 403,
        message: {
          status: 403
        },
        statusText: 'unauthorized'
      });
    });
  } else {
    response.status(403).send({
      status: 403,
      message: {
        status: 403
      },
      statusText: 'unauthorized'
    });
  }

};
