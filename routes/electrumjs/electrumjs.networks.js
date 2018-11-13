let networks = require('agama-wallet-lib/src/bitcoinjs-networks');
const {
  zec,
  vrsc,
} = require('bitgo-utxo-lib/src/networks');

networks.komodo = networks.kmd;
networks.zec = zec;
networks.zec.overwinter = true;
networks.vrsc = vrsc;
networks.vrsc.overwinter = true;

module.exports = networks;