const { get, uniqBy, uniq, isString } = require('lodash');
const { Query } = require('mingo');

const { Trade, queries: { getActiveRulesByFrequency, getIncompleteTrades } } = require('../models');
const rh = require('../services/rhApiService');
const tv = require('../services/tvApiService');
const logger = require('../services/logService');

const {
  marketTimes,
  assert,
  parsePattern,
  getValueFromPercentage,
  FIVE_SECONDS,
  FIVE_HOURS,
  TEN_MINUTES,
  ONE_MINUTE,
} = require('../services/utils');

// Todo: maybe move constants to `process.env.js`?
const OVERRIDE_MARKET_CLOSE = false;
const MANUALLY_SELL_ALL = false;

class Engine {
  constructor() {
    this.userTokens = new Map();
    this.userAccounts = new Map();
    this.users = [];
    this.rules = {
      [FIVE_SECONDS]: [],
      [ONE_MINUTE]: [],
    };
  }

  async start() {
    try {
      await this.loadRulesAndAccounts(ONE_MINUTE);
      await this.loadRulesAndAccounts(FIVE_SECONDS);
      await this.detectIntervalChange();

      setInterval(() => this.processFeeds(ONE_MINUTE), ONE_MINUTE);
      setInterval(() => this.processFeeds(FIVE_SECONDS), FIVE_SECONDS);
      setInterval(() => this.loadRulesAndAccounts(ONE_MINUTE), ONE_MINUTE);
      setInterval(() => this.loadRulesAndAccounts(FIVE_SECONDS), FIVE_SECONDS);

      logger.log('Engine started.');
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * Prepares user objects for use on @method processFeeds.
   * Steps include:
   * - Get fresh rules and users from DB
   * - Get or refresh(after 5h) user tokens
   * - Get or refresh(after 10m) user accounts
   * - Get fresh user orders
   * @returns {Promise<void>}
   */
  async loadRulesAndAccounts(frequency) {
    const { isMarketClosed } = marketTimes();

    if (!OVERRIDE_MARKET_CLOSE && isMarketClosed) {
      return;
    }

    // Fetch fresh rules
    this.rules[frequency] = await getActiveRulesByFrequency(frequency);
    const allRules = [...this.rules[FIVE_SECONDS], ...this.rules[ONE_MINUTE]];

    // Populate refId if not ready
    allRules.forEach(async rule => {
      if (!(rule.refId && rule.instrumentId && rule.instrumentUrl)) {
        await rule.save();
      }
    });

    // Fetch fresh users
    this.users = uniqBy(allRules.map(rule => ({ ...rule.user.toObject(), _id: rule.user._id.toString() })), '_id');

    // Store all user tokens for authentication
    const tokenPromises = this.users.map((user, index) => {
      const userToken = this.userTokens.get(user._id.toString());

      // Refresh token only after 5 hours
      if (!userToken || (((new Date()) - new Date(userToken.date)) >= FIVE_HOURS)) {
        return rh.auth(user.brokerConfig)
          .then(token => {
            this.users[index].token = token;
            this.userTokens.set(user._id.toString(), { token, date: new Date() });
          });
      }

      // Append token
      user.token = userToken.token;
      return null;
    }).filter(u => u);

    await Promise.all(tokenPromises);

    // Append user accounts
    const accountPromises = this.users.map((user, index) => {
      const userAccount = this.userAccounts.get(user._id.toString());

      // Refresh account only after 10 mins
      if (!userAccount || (((new Date()) - new Date(userAccount.date)) >= TEN_MINUTES)) {
        return rh.getAccount(user)
          .then(account => {
            this.users[index].account = account;
            this.userAccounts.set(user._id.toString(), { account, date: new Date() });
          });
      }

      // Append account
      user.account = userAccount.account;
      return null;
    }).filter(a => a);

    // Append user positions
    const positionPromises = this.users.map((user, index) => rh.getPositions(user)
      .then(positions => this.users[index].positions = positions));

    // Append rule orders by refId
    const orderPromises = this.rules[frequency].map((rule, index) => {
      const user = this.users.find(({ _id }) => rule.user._id.equals(_id));
      return this.getRuleOrders(user, rule)
        .then((orders = []) => {
          if (orders.length) {
            this.rules[frequency][index].orders = orders;
          }
        });
    });

    return Promise.all(accountPromises.concat(orderPromises).concat(positionPromises))
      .catch(error => logger.error(error));
  }

  async processFeeds(frequency) {
    try {
      const { isMarketClosed, secondsLeftToMarketClosed } = marketTimes();
      const rules = this.rules[frequency];

      if ((!OVERRIDE_MARKET_CLOSE && isMarketClosed) || !rules.length) {
        return;
      }

      const symbols = uniq(rules.map(r => `${r.exchange}:${r.symbol}`));
      const [quotes, trades] = await Promise.all([tv.getQuotes(...symbols), getIncompleteTrades()]);
      const promises = [];

      rules.forEach(async rule => {
        try {
          const user = this.users.find(u => rule.user._id.equals(u._id));
          assert(user, `User ${rule.user._id} not found in rule ${rule._id}`);

          const quote = quotes.find(q => q.symbol === `${rule.exchange}:${rule.symbol}`);
          assert(quote, `Quote for ${rule.symbol} not found`);

          let trade = trades.find(trade => rule._id.equals(trade.rule));
          let lastOrderIsSell = !trade;
          let lastOrderIsBuy = null;

          /**
           * Trade management
           */
          if (trade) {
            const lastOrderId = get(trade, 'sellOrderId') || get(trade, 'buyOrderId');
            assert(lastOrderId, `Trade without sellOrderId or buyOrderId found. Id: ${trade._id}`);

            let lastOrder = get(rule, 'orders', []).find(({ id }) => id === lastOrderId);
            if (!lastOrder) {
              // Get fresh rule orders
              [rule.orders, lastOrder] = await Promise.all([
                this.getRuleOrders(user, rule),
                rh.getOrder(lastOrderId, user),
              ]);
            }
            assert(lastOrder, `Fatal error. Order not found for order id: ${lastOrderId} and trade id: ${trade._id}`);

            const lastOrderIsFilled = get(lastOrder, 'state') === 'filled';
            lastOrderIsSell = get(lastOrder, 'side') === 'sell';
            lastOrderIsBuy = get(lastOrder, 'side') === 'buy';

            if (lastOrderIsFilled) {
              const price = Number(get(lastOrder, 'average_price'));
              const date = new Date(get(lastOrder, 'updated_at'));

              if (lastOrderIsBuy) {
                trade.buyPrice = price;
                trade.buyDate = date;
                trade.riskValue = getValueFromPercentage(price, rule.limits.riskPercentage, 'risk');
                trade.profitValue = getValueFromPercentage(price, rule.limits.profitPercentage, 'profit');
              }
              else if (lastOrderIsSell) {
                trade.sellPrice = price;
                trade.sellDate = date;
                trade.completed = true;

                // Save and close trade
                await trade.save();

                // Reset trade vars
                trade = null;
                lastOrder = null;

                // Exit if rule has no strategy to continue
                if(!rule.strategy.in) {
                  rule.enabled = false;
                  await rule.save();
                  return;
                }
              }
            }
            // Todo BIG: check for partially filled orders!

            // Cancel pending(non-filled) order
            else {
              const canceledSuccessfully = await this.cancelLastOrder(user, lastOrder, rule.symbol, rule.name);
              assert(canceledSuccessfully, `Failed to cancel order: ${lastOrder.id}`);

              if (lastOrderIsBuy) {
                // Clean up trade after canceled order
                await trade.remove();

                trade = null;
                lastOrderIsBuy = false;
                lastOrderIsSell = true;
              }
              else if (lastOrderIsSell) {
                trade.sellPrice = undefined;
                trade.sellDate = undefined;
                trade.sellOrderId = undefined;
                trade.completed = false;

                lastOrderIsBuy = true;
                lastOrderIsSell = false;
              }
            }
          }

          const parse = (n) => parseFloat(Math.round(n * 100) / 100).toFixed(2);

          console.log(
            `[ ${rule.name.substring(0, 10)}... ]`,
            ' => close: ', parse(quote.close),
            '| entry: ', parse(get(trade, 'buyPrice', 0)),
            '| risk: ', parse(get(trade, 'riskValue', 0)),
            '| profit: ', parse(get(trade, 'profitValue', 0)),
            '| follow: ', get(rule, 'limits.followPrice', false),
            '\n======================================================================================================='
          );

          const { numberOfShares, symbol, holdOvernight } = rule;
          const price = quote.close;
          const metadata = { ...rule.toObject(), ...user, ...quote };
          const buyQuery = new Query(parsePattern(get(rule, 'strategy.in.query'), metadata, false));
          const sellQuery = new Query(parsePattern(get(rule, 'strategy.out.query'), metadata, true));
          assert(buyQuery.__criteria || sellQuery.__criteria, `No strategy found for rule ${rule._id}`);

          const riskValue = get(trade, 'riskValue', 0);
          const profitValue = get(trade, 'profitValue', null);
          const riskPriceReached = riskValue > price;
          const profitPriceReached = profitValue && profitValue < price;
          const commonOptions = { user, symbol, price, numberOfShares, rule, trade };

          /**
           * End of day is approaching (4PM EST), sell all shares in the last 30sec if rule is not holding overnight
           */
          if (MANUALLY_SELL_ALL || !OVERRIDE_MARKET_CLOSE &&
            (secondsLeftToMarketClosed < 30 && !holdOvernight)) {
            if (lastOrderIsBuy) {
              promises.push(this.placeOrder({
                ...commonOptions,
                side: 'sell',
                name: `${get(rule, 'name')}(${MANUALLY_SELL_ALL ? 'Manual sell' : 'Sell before market is closed'})`,
              }));
            }
            // Exit at this point
            return;
          }

          /**
           * BUY pattern
           */
          if (lastOrderIsSell && buyQuery.test(metadata)) {
            promises.push(this.placeOrder({
              ...commonOptions,
              side: 'buy',
              name: get(rule, 'name'),
            }));
          }

          /**
           * SELL pattern
           */
          else if (lastOrderIsBuy && (riskPriceReached || profitPriceReached || sellQuery.test(metadata))) {
            promises.push(this.placeOrder({
              ...commonOptions,
              side: 'sell',
              name: sellQuery.test(quote) ? get(rule, 'name') : `${get(rule, 'name')}(Risk reached)`,
            }));
          }

          /**
           * Follow price logic
           */
          else if (lastOrderIsBuy && get(trade, 'buyPrice') && rule.limits.followPrice) {
            const buyPrice = get(trade, 'buyPrice');
            const { riskPercentage } = rule.limits;
            const realizedGainPerc = ((price - buyPrice) / buyPrice) * 100;

            // Gains are higher than half the risk taken
            if (realizedGainPerc > (riskPercentage / 2)) {
              const newRiskValue = getValueFromPercentage(price, riskPercentage, 'risk');
              // Increase risk value only if the new risk is higher
              if (newRiskValue > riskValue) {
                trade.riskValue = newRiskValue;
              }
            }
          }

          if (trade && trade.isModified()) {
            promises.push(trade.save());
          }
        } catch (error) {
          logger.error(error);
        }
      });

      return Promise.all(promises);
    } catch (error) {
      logger.error(error);
    }

    return Promise.resolve();
  }

  /**
   * Helper function to fetch orders associated with a rule
   * @note Move into a helper service
   * @param user
   * @param rule
   * @returns {Promise<PromiseLike | never>}
   */
  getRuleOrders(user, rule) {
    return rh.getOrders(user)
      .then((orders = []) => orders
        .filter(o => isString(o.ref_id) && o.ref_id.endsWith(rule.refId)))
      .catch(error => {
        if (get(error, 'message').includes('Request was throttled')) {
          return [];
        }
        logger.error(error);
      });
  }

  /**
   * Cancels pending order
   * @param user
   * @param lastOrder
   * @param name
   * @param symbol
   * @returns {Promise}
   */
  cancelLastOrder(user, lastOrder, symbol, name) {
    if (get(lastOrder, 'state') === 'canceled') {
      return Promise.resolve(true);
    }

    if (get(lastOrder, 'state') !== 'filled' && get(lastOrder, 'cancel')) {
      return rh.postWithAuth(user, lastOrder.cancel)
        .then(() => logger.orderCanceled({ ...lastOrder, symbol, name }))
        .then(() => true)
        .catch(() => false);
    }

    return Promise.resolve(false);
  }

  /**
   * Cancels pending orders and places sell order
   * @param side
   * @param user
   * @param name
   * @param symbol
   * @param price
   * @param numberOfShares
   * @param rule
   * @param trade
   * @returns {Promise}
   */
  async placeOrder({ side, user, symbol, price, numberOfShares, rule, name, trade }) {
    let finalPrice;
    if (side === 'buy') {
      // Buy 0.01% higher than market price to get an easier fill
      finalPrice = (Number(price) * 1.0001).toFixed(2).toString();
    } else {
      // Sell 0.01% lower than market price to get an easier fill
      finalPrice = (Number(price) * 0.9999).toFixed(2).toString();
    }

    const options = {
      account: get(user, 'account.url', null),
      quantity: numberOfShares,
      price: finalPrice,
      symbol,
      side,
      instrument: rule.instrumentUrl,
      time_in_force: 'gtc',
      type: 'limit',
      trigger: 'immediate',
      override_day_trade_checks: rule.overrideDayTradeChecks,
      ref_id: rule.UUID()
    };

    return rh.placeOrder(user, options)
      .then(order => {
        logger.orderPlaced({ symbol, price, ...order, name });

        // Update order id on trade
        if (side === 'buy') {
          if (!trade) {
            trade = new Trade({ rule: rule._id.toString(), user: user._id.toString() });
          }
          trade.buyOrderId = order.id;
        } else {
          trade.sellOrderId = order.id;
        }

        return trade.save();
      })
      .catch(error => {
        if (get(error, 'message', '').includes('Not enough shares to sell')) {
          trade.sellOrderId = 'not-captured';
          trade.completed = true;
          trade.sellPrice = price;
          trade.sellDate = new Date();

          return trade.save();
        } else {
          logger.error({ message: `Failed to place order for rule ${name}. ${error.message}` });
        }
      });
  }

  /**
   * Awaits until a change in the quote's price is detected
   * @returns {Promise}
   */
  async detectIntervalChange() {
    let prices = null;
    let changeDetected = false;
    while (!changeDetected) {
      const symbols = uniq(this.rules[FIVE_SECONDS].map(r => `${r.exchange}:${r.symbol}`));
      const quotes = await tv.getQuotes(...symbols);
      const currentPrices = quotes.map(quote => quote.close);

      if (!prices) {
        prices = currentPrices;
      }

      changeDetected = currentPrices !== prices;
    }
  }
}

module.exports = new Engine();