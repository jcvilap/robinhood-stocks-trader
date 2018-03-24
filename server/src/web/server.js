const Koa = require('koa');
const mount = require('koa-mount');
const graphqlHTTP = require('koa-graphql');
const {WEB_PORT, DB} = require('../env');

class App {
  constructor() {
    this.server = new Koa();
    mongoose.connect(DB);
    this.db = mongoose.connection;

    this.handleExit = this.handleExit.bind(this);
    this.registerEvents();
    this.start();
  }

  registerEvents() {
    process.on('SIGTERM', this.handleExit);
    this.db.on('error', (e) => console.error('connection error:', e));
    this.db.once('open', () => console.log('Database connected'));
  }

  /**
   * After successfully listening on port, start the engine
   */
  start() {
    this.server.use(mount('/graphql', graphqlHTTP({
      schema: MyGraphQLSchema,
      graphiql: true
    })));

    this.server.listen(WEB_PORT, () => {
      console.log('Listening to port:', WEB_PORT);
      this.engine.start();
    });
  }

  handleExit() {
    this.server.close(() => process.exit(0));
  }
}

module.exports = new App();