const RuleSchema = `
  type Rule {
    accountInt: String!
    symbol: String!
    instrumentId: String!
    instrumentUrl: String!
    price: Int!
    size: Int!
    quantity: Int!
    time: String!
    status: String!
    tradingHalted: Boolean!
    portfolioDiversity: Int!
    high: Int!
    stopLossPerc: Int!
    stopLossPrice: Int!
    low: Int!
    limitPerc: Int!
    limitPrice: Int!
    riskPerc: Int!
    riskPrice: Int!
    limitOrderId: String!
    shouldUpdateLimitOrder: Boolean!
  }
  
  type Query {
    allRules: [Rule!]!
  }
  
  type Mutation {
    createRule(symbol: String!): Rule!
  }
  
  schema {
    query: Query
    mutation: Mutation
  }
`;

const RuleResolvers = {
  Query: {
    allRules: async (parent, args, {Rule}) => {
      const rules = await Rule.find();
      return rules;
    }
  },
  Mutation: {
    createRule: async (parent, args, {Rule}) => {
      const rule = await new Rule(args).save();
      return rule;
    }
  }
};

module.exports = {RuleSchema, RuleResolvers};
