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
  }

  registerEvents() {
    process.on('SIGTERM', () => this.handleExit());
    this.db.on('error', (e) => console.error('connection error:', e));
    this.db.once('open', () => this.start());
  }

  start() {
    createApi(this.db);
    this.server.listen(ENGINE_PORT, () => {
      console.log('Engine running on port:', ENGINE_PORT);
      //this.engine.start();
    });
  }

  handleExit() {
    this.server.close(() => process.exit(0));
  }
}

module.exports = new App();
