const express = require('express');
const bodyParser = require('body-parser');
const {graphiqlExpress, graphqlExpress} = require('apollo-server-express');
const {makeExecutableSchema} = require('graphql-tools');
const {WEB_PORT, DB} = require('../env');
const mongoose = require('mongoose');
const {Rule} = require('../models/mongoose/Rule');
const {RuleSchema, RuleResolvers} = require('../models/graphql/Rule');

class App {
  constructor() {
    this.server = express();
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
    const schema = makeExecutableSchema({typeDefs: RuleSchema, resolvers: RuleResolvers});
    this.server.use('/graphql', bodyParser.json(), graphqlExpress({schema, context: {Rule}}));
    this.server.use('/graphiql', graphiqlExpress({endpointURL: '/graphql'}));
    this.server.listen(WEB_PORT, () => console.log('Listening to port:', WEB_PORT));
  }

  handleExit() {
    this.server.close(() => process.exit(0));
  }
}

module.exports = new App();