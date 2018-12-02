const { createServer } = require('http');
const { ENGINE_PORT, DB } = require('./config/env');
const createApi = require('./api');
const Engine = require('./engine/Engine');
const mongoose = require('mongoose');

class App {
  constructor() {
    this.server = createServer();
    this.engine = new Engine();

    mongoose.connect(DB, { useNewUrlParser: true });
    mongoose.Promise = global.Promise;

    this.db = mongoose.connection;

    this.registerEvents();

    this.handleExit = this.handleExit.bind(this);
  }

  registerEvents() {
    process.on('SIGTERM', this.handleExit);
    this.db.on('error', (e) => console.error('connection error:', e));
    this.db.once('open', () => createApi(this.db)/* && this.start()*/);
  }

  /**
   * After successfully listening on port, start the engine
   */
  start() {
    this.server.listen(ENGINE_PORT, () => {
      console.log('Listening to port:', ENGINE_PORT);
      this.engine.start();
    });
  }

  handleExit() {
    this.server.close(() => process.exit(0));
  }
}

module.exports = new App();
