const { isKomodoCoin } = require('agama-wallet-lib/src/coin-helpers');

const txDecoder = {
  default: require('../../electrumjs/electrumjs.txdecoder.js'),
  zcash: require('../../electrumjs/electrumjs.txdecoder-2bytes.js'),
  pos: require('../../electrumjs/electrumjs.txdecoder-pos.js'),
};

module.exports = (api) => {
  api.isZcash = (network) => {
    if (isKomodoCoin(network)) {
      network = 'kmd';
    }

    if (api.electrumJSNetworks[network.toLowerCase()] &&
        api.electrumJSNetworks[network.toLowerCase()].isZcash) {
      return true;
    }
  };

  api.isPos = (network) => {
    if (api.electrumJSNetworks[network.toLowerCase()] &&
        api.electrumJSNetworks[network.toLowerCase()].isPoS) {
      return true;
    }
  };

  api.electrumJSTxDecoder = (rawtx, networkName, network, insight) => {
    if (api.isZcash(networkName) &&
        network.overwinter) {
      return txDecoder.zcash(rawtx, network);
    } else if (api.isPos(networkName)) {
      return txDecoder.pos(rawtx, network);
    } else if (insight) {
      console.log('insight decoder');
    } else {
      return txDecoder.default(rawtx, network);
    }
  };

  api.getNetworkData = (network) => {
    let coin = api.findNetworkObj(network) || api.findNetworkObj(network.toUpperCase()) || api.findNetworkObj(network.toLowerCase());
    const coinUC = coin ? coin.toUpperCase() : null;

    if (!coin &&
        !coinUC) {
      coin = network.toUpperCase();
    }

    if (network.toLowerCase() === 'vrsc') {
      return api.electrumJSNetworks.vrsc;
    }

    if (isKomodoCoin(coin) ||
        isKomodoCoin(coinUC)) {
      return api.electrumJSNetworks.kmd;
    } else {
      return api.electrumJSNetworks[network];
    }
  }

  api.findNetworkObj = (coin) => {
    for (let key in api.electrumServers) {
      if (key.toLowerCase() === coin.toLowerCase()) {
        return key;
      }
    }
  }

  api.get('/electrum/servers', (req, res, next) => {
    if (api.checkToken(req.query.token)) {
      if (req.query.abbr) { // (?) change
        let _electrumServers = {};

        for (let key in api.electrumServers) {
          _electrumServers[key] = api.electrumServers[key];
        }

        const retObj = {
          msg: 'success',
          result: {
            servers: _electrumServers,
          },
        };

        res.end(JSON.stringify(retObj));
      } else {
        const retObj = {
          msg: 'success',
          result: {
            servers: api.electrumServers,
          },
        };

        res.end(JSON.stringify(retObj));
      }
    } else {
      const retObj = {
        msg: 'error',
        result: 'unauthorized access',
      };

      res.end(JSON.stringify(retObj));
    }
  });

  api.get('/electrum/coins/server/set', (req, res, next) => {
    const _coin = req.query.coin.toLowerCase();

    if (api.checkToken(req.query.token)) {
      api.electrumCoins[_coin].server = {
        ip: req.query.address,
        port: req.query.port,
        proto: req.query.proto,
      };

      for (let key in api.electrumServers) {
        if (key === _coin) {
          api.electrumServers[key].address = req.query.address;
          api.electrumServers[key].port = req.query.port;
          api.electrumServers[key].proto = req.query.proto;
          break;
        }
      }

      // api.log(JSON.stringify(api.electrumCoins[req.query.coin], null, '\t'), true);

      const retObj = {
        msg: 'success',
        result: true,
      };

      res.end(JSON.stringify(retObj));
    } else {
      const retObj = {
        msg: 'error',
        result: 'unauthorized access',
      };

      res.end(JSON.stringify(retObj));
    }
  });

  api.get('/electrum/servers/test', (req, res, next) => {
    if (api.checkToken(req.query.token)) {
      const ecl = api.ecl(null, {
        port: req.query.port,
        ip: req.query.address,
        proto: req.query.proto,
      });

      ecl.connect();
      ecl.serverVersion()
      .then((serverData) => {
        ecl.close();
        api.log('serverData', 'spv.server.test');
        api.log(serverData, 'spv.server,test');

        if (serverData &&
            typeof serverData === 'string' &&
            serverData.indexOf('Electrum') > -1) {
          const retObj = {
            msg: 'success',
            result: true,
          };

          res.end(JSON.stringify(retObj));
        } else if (
          serverData &&
          typeof serverData === 'object'
        ) {
          for (let i = 0; i < serverData.length; i++) {
            if (serverData[i].indexOf('Electrum') > -1) {
              const retObj = {
                msg: 'success',
                result: true,
              };

              res.end(JSON.stringify(retObj));

              break;
              return true;
            }
          }

          const retObj = {
            msg: 'error',
            result: false,
          };

          res.end(JSON.stringify(retObj));
        } else {
          const retObj = {
            msg: 'error',
            result: false,
          };

          res.end(JSON.stringify(retObj));
        }
      });
    } else {
      const retObj = {
        msg: 'error',
        result: 'unauthorized access',
      };

      res.end(JSON.stringify(retObj));
    }
  });

  // remote api switch wrapper
  api.ecl = (network, customElectrum) => {
    if (!network) {
      return new api.electrumJSCore(
        customElectrum.port,
        customElectrum.ip,
        customElectrum.proto,
        api.appConfig.spv.socketTimeout
      );
    } else {
      let _currentElectrumServer;
      network = network.toLowerCase();

      if (api.electrumCoins[network]) {
        _currentElectrumServer = api.electrumCoins[network];
      } else {
        const _server = api.electrumServers[network].serverList[0].split(':');
        _currentElectrumServer = {
          ip: _server[0],
          port: _server[1],
          proto: _server[2],
        };
      }

      if (api.electrumServers[network].proto === 'insight') {
        return api.insightJSCore(api.electrumServers[network]);
      } else {
        if (api.appConfig.spv.proxy) {
          return api.proxy(network, customElectrum);
        } else {
          const electrum = customElectrum ? {
            port: customElectrum.port,
            ip: customElectrum.ip,
            proto: customElectrum.proto,
          } : {
            port: api.electrumCoins[network] && api.electrumCoins[network].server.port || _currentElectrumServer.port,
            ip: api.electrumCoins[network] && api.electrumCoins[network].server.ip || _currentElectrumServer.ip,
            proto: api.electrumCoins[network] && api.electrumCoins[network].server.proto || _currentElectrumServer.proto,
          };

          return new api.electrumJSCore(
            electrum.port,
            electrum.ip,
            electrum.proto,
            api.appConfig.spv.socketTimeout
          );
        }
      }
    }
  }

  return api;
};