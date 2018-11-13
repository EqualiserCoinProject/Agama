const electrumServers = require('../electrumjs/electrumServers');
const request = require('request');
const chainParams = require('../chainParams');

module.exports = (api) => {
  api.startSPV = (coin) => {
    if (coin === 'KMD+REVS+JUMBLR') {
      api.addElectrumCoin('KMD');
      api.addElectrumCoin('REVS');
      api.addElectrumCoin('JUMBLR');
    } else {
      if (process.argv.indexOf('spvcoins=all/add-all') > -1) {
        for (let key in electrumServers) {
          api.addElectrumCoin(key.toUpperCase());
        }
      } else {
        api.addElectrumCoin(coin);
      }
    }
  }

  api.startKMDNative = (selection, isManual) => {
    let herdData;

    const httpRequest = () => {
      const options = {
        url: `http://127.0.0.1:${api.appConfig.agamaPort}/api/herd`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          herd: 'komodod',
          options: herdData,
          token: api.appSessionHash,
        }),
      };

      request(options, (error, response, body) => {
        // resolve(body);
      });
    };

    if (isManual) {
      api.kmdMainPassiveMode = true;
    }

    if (selection === 'KMD') {
      herdData = {
        ac_name: 'komodod',
        ac_options: [
          '-daemon=0',
          '-addnode=78.47.196.146',
        ],
      };

      httpRequest();
    } else if (
      selection === 'REVS' ||
      selection === 'JUMRLR' ||
      selection === 'MNZ' ||
      selection === 'BTCH' ||
      selection === 'BNTN'
    ) {
      herdData = {
        ac_name: selection,
        ac_options: [
          '-daemon=0',
          '-server',
          `-ac_name=${selection}`,
          `-addnode=${chainParams[selection].addnone}`,
          `-addnode=${chainParams[selection].ac_supply}`,
        ],
      };

      httpRequest();
    } else {
      const herdData = [{
        ac_name: 'komodod',
        ac_options: [
          '-daemon=0',
          '-addnode=78.47.196.146',
        ],
      }, {
        ac_name: 'REVS',
        ac_options: [
          '-daemon=0',
          '-server',
          `-ac_name=REVS`,
          `-addnode=${chainParams.REVS.addnone}`,
          `-addnode=${chainParams.REVS.ac_supply}`,
        ],
      }, {
        ac_name: 'JUMBLR',
        ac_options: [
          '-daemon=0',
          '-server',
          `-ac_name=JUMBLR`,
          `-addnode=${chainParams.JUMBLR.addnone}`,
          `-addnode=${chainParams.JUMBLR.ac_supply}`,
        ],
      }];

      for (let i = 0; i < herdData.length; i++) {
        setTimeout(() => {
          const options = {
            url: `http://127.0.0.1:${api.appConfig.agamaPort}/api/herd`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              herd: 'komodod',
              options: herdData[i],
              token: api.appSessionHash,
            }),
          };

          request(options, (error, response, body) => {
            // resolve(body);
          });
        }, 100);
      }
    }
  };

  return api;
};