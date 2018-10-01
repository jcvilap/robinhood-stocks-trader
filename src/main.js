const { createServer } = require('http');
const { PORT } = require('./config/env');
const Engine = require('./engine/Engine');

class App {
  constructor() {
    this.server = createServer();
    this.engine = new Engine();

    this.registerEvents();
    this.start();

    this.handleExit = this.handleExit.bind(this);
  }

  registerEvents() {
    process.on('SIGTERM', this.handleExit);
  }

  /**
   * After successfully listening on port, start the engine
   */
  start() {
    this.server.listen(PORT, () => {
      console.log('Listening to port:', PORT);
      this.engine.start();
    });
  }

  handleExit() {
    this.server.close(() => process.exit(0));
  };
}

module.exports = new App();
