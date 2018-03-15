# Stocks Day-Trader
[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/jcvilap/stocks-day-trader)

## Milestones
#### Setup
- [x] Set up a Node server and deploy it to Heroku
- [x] Setup a Mongo instance in mLab and connect to it from Node
- [ ] Deploy Client app to Surge.sh and point server calls to server's APIs

#### Server
- [ ] Connect to IEX API to access market data using their WebSockets API 
- [ ] Listen to changes on the market
- [ ] Define `Rule` class
- [ ] Instantiate initial `Rule` objects with default limits and persist data on Mongo
- [ ] Fetch user `rules` from database on load
- [ ] Fetch user accounts using the Robinhood Private API
- [ ] Fetch pending orders using the Robinhood Private API
- [ ] Fetch instruments using the Robinhood Private API
- [ ] Enable Buy/Sell/Stop/Limit actions using the Robinhood Private API
- [ ] Watch for stock changes based on `rules`
- [ ] After each market feed, process `rules` and ultimately place orders or update limits
- [ ] Add after-hours trading logic based on volume
- [ ] Add day-trade limitations logic

### Client
- [ ] Enable new users to enter their Robinhood credentials
- [ ] Enable user to create or reuse `rules`
- [ ] Enable the user to associate stocks to `rules`
- [ ] Enable user to start/stop their `stocks-day-traders`

## Docs
### 3rd Party APIs
- Stocks feed: [IEX Trading](https://iextrading.com/developer/)
- Stocks order management: [Robinhood's Private API](https://api.robinhood.com/)

### Rules
I define a `Rule` as a single instance of multiple trading strategies to be used by the `Engine`. Rules can be defined by the user and will be stored in the Mongo instance

### License

Copyright (c) 2018 Julio Vila

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
