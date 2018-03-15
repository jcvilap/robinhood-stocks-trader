const {Rule, validateRule} = require('../models/Rule');
const Utils = require('../utils');
const {IEX_API_WS_FEED} = require('../env');
const socket = require('socket.io-client')(IEX_API_WS_FEED);

class Engine {
  constructor() {
    socket.on('connect', () => {
      socket.emit('subscribe', 'FB')
    });

    socket.on('message', function(data){
      console.log(JSON.stringify(data));
    });
  }
}

module.exports = Engine;