const async = require('async');
const Promise = require('bluebird');
const { hex2str } = require('agama-wallet-lib/src/crypto/utils');

// TODO: add z -> pub, pub -> z flag for zcash forks

module.exports = (api) => {
  api.get('/electrum/listtransactions', (req, res, next) => {
    if (api.checkToken(req.query.token)) {
      api.listtransactions({
        network: req.query.network,
        coin: req.query.coin,
        address: req.query.address,
        kv: req.query.kv,
        maxlength: api.appConfig.spv.listtransactionsMaxLength,
        full: req.query.full,
      })
      .then((txhistory) => {
        res.end(JSON.stringify(txhistory));
      });
    } else {
      const retObj = {
        msg: 'error',
        result: 'unauthorized access',
      };

      res.end(JSON.stringify(retObj));
    }
  });

  api.listtransactions = (config, options) => {
    return new Promise((resolve, reject) => {
      const network = config.network || api.findNetworkObj(config.coin);
      const ecl = api.ecl(network);
      const _address = config.address;
      const isKv = config.kv;
      const _maxlength = isKv ? 10 : config.maxlength;

      api.log('electrum listtransactions ==>', 'spv.listtransactions');

      if (!config.full ||
          ecl.insight) {
        ecl.connect();
        ecl.blockchainAddressGetHistory(_address)
        .then((json) => {
          ecl.close();
          api.log(json, 'spv.listtransactions');

          json = api.sortTransactions(json, 'timestamp');

          const retObj = {
            msg: 'success',
            result: json,
          };
          resolve(retObj);
        });
      } else {
        // !expensive call!
        // TODO: limit e.g. 1-10, 10-20 etc
        const MAX_TX = _maxlength || 10;
        ecl.connect();

        api.electrumGetCurrentBlock(network)
        .then((currentHeight) => {
          if (currentHeight &&
              Number(currentHeight) > 0) {
            ecl.blockchainAddressGetHistory(_address)
            .then((json) => {
              if (json &&
                  json.length) {
                let _rawtx = [];

                json = api.sortTransactions(json);
                json = json.length > MAX_TX ? json.slice(0, MAX_TX) : json;

                api.log(json.length, 'spv.listtransactions');
                let index = 0;

                // callback hell, use await?
                async.eachOfSeries(json, (transaction, ind, callback) => {
                  api.getBlockHeader(
                    transaction.height,
                    network,
                    ecl
                  )
                  .then((blockInfo) => {
                    if (blockInfo &&
                        blockInfo.timestamp) {
                      api.getTransaction(
                        transaction.tx_hash,
                        network,
                        ecl
                      )
                      .then((_rawtxJSON) => {
                        api.log('electrum gettransaction ==>', 'spv.listtransactions');
                        api.log((index + ' | ' + (_rawtxJSON.length - 1)), 'spv.listtransactions');
                        // api.log(_rawtxJSON, 'spv.listtransactions');

                        // decode tx
                        const _network = api.getNetworkData(network);
                        let decodedTx;

                        if (api.getTransactionDecoded(transaction.tx_hash, network)) {
                          decodedTx = api.getTransactionDecoded(
                            transaction.tx_hash,
                            network
                          );
                        } else {
                          decodedTx = api.electrumJSTxDecoder(
                            _rawtxJSON,
                            network,
                            _network
                          );
                          api.getTransactionDecoded(
                            transaction.tx_hash,
                            network,
                            decodedTx
                          );
                        }

                        let txInputs = [];
                        let opreturn = false;

                        api.log(`decodedtx network ${network}`, 'spv.listtransactions');

                        api.log('decodedtx =>', 'spv.listtransactions');
                        // api.log(decodedTx.outputs, 'spv.listtransactions');

                        let index2 = 0;

                        if (decodedTx &&
                            decodedTx.outputs &&
                            decodedTx.outputs.length) {
                          for (let i = 0; i < decodedTx.outputs.length; i++) {
                            if (decodedTx.outputs[i].scriptPubKey.type === 'nulldata') {
                              if (isKv) {
                                opreturn = {
                                  kvHex: decodedTx.outputs[i].scriptPubKey.hex,
                                  kvAsm: decodedTx.outputs[i].scriptPubKey.asm,
                                  kvDecoded: api.kvDecode(decodedTx.outputs[i].scriptPubKey.asm.substr(10, decodedTx.outputs[i].scriptPubKey.asm.length), true),
                                };
                              } else {
                                opreturn = hex2str(decodedTx.outputs[i].scriptPubKey.hex);
                              }
                            }
                          }
                        }

                        if (decodedTx &&
                            decodedTx.inputs &&
                            decodedTx.inputs.length) {
                          async.eachOfSeries(decodedTx.inputs, (_decodedInput, ind2, callback2) => {
                            const checkLoop = () => {
                              index2++;

                              if (index2 === decodedTx.inputs.length ||
                                  index2 === api.appConfig.spv.maxVinParseLimit) {
                                api.log(`tx history decode inputs ${decodedTx.inputs.length} | ${index2} => main callback`, 'spv.listtransactions');
                                const _parsedTx = {
                                  network: decodedTx.network,
                                  format: decodedTx.format,
                                  inputs: txInputs,
                                  outputs: decodedTx.outputs,
                                  height: transaction.height,
                                  timestamp: Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timestamp,
                                  confirmations: Number(transaction.height) === 0 || Number(transaction.height) === -1 ? 0 : currentHeight - transaction.height,
                                };

                                const formattedTx = api.parseTransactionAddresses(
                                  _parsedTx,
                                  _address,
                                  network
                                );

                                if (formattedTx.type) {
                                  formattedTx.height = transaction.height;
                                  formattedTx.blocktime = Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timestamp;
                                  formattedTx.timereceived = Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timereceived;
                                  formattedTx.hex = _rawtxJSON;
                                  formattedTx.inputs = decodedTx.inputs;
                                  formattedTx.outputs = decodedTx.outputs;
                                  formattedTx.locktime = decodedTx.format.locktime;
                                  formattedTx.vinLen = decodedTx.inputs.length;
                                  formattedTx.vinMaxLen = api.appConfig.spv.maxVinParseLimit;
                                  formattedTx.opreturn = opreturn;
                                  _rawtx.push(formattedTx);
                                } else {
                                  formattedTx[0].height = transaction.height;
                                  formattedTx[0].blocktime = Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timestamp;
                                  formattedTx[0].timereceived = Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timereceived;
                                  formattedTx[0].hex = _rawtxJSON;
                                  formattedTx[0].inputs = decodedTx.inputs;
                                  formattedTx[0].outputs = decodedTx.outputs;
                                  formattedTx[0].locktime = decodedTx.format.locktime;
                                  formattedTx[0].vinLen = decodedTx.inputs.length;
                                  formattedTx[0].vinMaxLen = api.appConfig.spv.maxVinParseLimit;
                                  formattedTx[0].opreturn = opreturn[0];
                                  formattedTx[1].height = transaction.height;
                                  formattedTx[1].blocktime = Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timestamp;
                                  formattedTx[1].timereceived = Number(transaction.height) === 0 || Number(transaction.height) === -1 ? Math.floor(Date.now() / 1000) : blockInfo.timereceived;
                                  formattedTx[1].hex = _rawtxJSON;
                                  formattedTx[1].inputs = decodedTx.inputs;
                                  formattedTx[1].outputs = decodedTx.outputs;
                                  formattedTx[1].locktime = decodedTx.format.locktime;
                                  formattedTx[1].vinLen = decodedTx.inputs.length;
                                  formattedTx[1].vinMaxLen = api.appConfig.spv.maxVinParseLimit;
                                  formattedTx[1].opreturn = opreturn[1];
                                  _rawtx.push(formattedTx[0]);
                                  _rawtx.push(formattedTx[1]);
                                }
                                index++;

                                if (index === json.length) {
                                  ecl.close();

                                  if (isKv) {
                                    let _kvTx = [];

                                    for (let i = 0; i < _rawtx.length; i++) {
                                      if (_rawtx[i].opreturn &&
                                          _rawtx[i].opreturn.kvDecoded) {
                                        _kvTx.push(_rawtx[i]);
                                      }
                                    }

                                    _rawtx = _kvTx;
                                  }

                                  const retObj = {
                                    msg: 'success',
                                    result: _rawtx,
                                  };
                                  resolve(retObj);
                                }

                                callback();
                                api.log(`tx history main loop ${json.length} | ${index}`, 'spv.listtransactions');
                              } else {
                                callback2();
                              }
                            }

                            if (_decodedInput.txid !== '0000000000000000000000000000000000000000000000000000000000000000') {
                              api.getTransaction(
                                _decodedInput.txid, network, ecl)
                              .then((rawInput) => {
                                const decodedVinVout = api.electrumJSTxDecoder(
                                  rawInput,
                                  network,
                                  _network
                                );

                                if (decodedVinVout) {
                                  api.log(decodedVinVout.outputs[_decodedInput.n], 'spv.listtransactions');
                                  txInputs.push(decodedVinVout.outputs[_decodedInput.n]);
                                }
                                checkLoop();
                              });
                            } else {
                              checkLoop();
                            }
                          });
                        } else {
                          const _parsedTx = {
                            network: decodedTx.network,
                            format: 'cant parse',
                            inputs: 'cant parse',
                            outputs: 'cant parse',
                            height: transaction.height,
                            timestamp: Number(transaction.height) === 0 ? Math.floor(Date.now() / 1000) : blockInfo.timestamp,
                            confirmations: Number(transaction.height) === 0 ? 0 : currentHeight - transaction.height,
                            opreturn,
                          };

                          const formattedTx = api.parseTransactionAddresses(
                            _parsedTx,
                            _address,
                            network
                          );
                          _rawtx.push(formattedTx);
                          index++;

                          if (index === json.length) {
                            ecl.close();

                            if (isKv) {
                              let _kvTx = [];

                              for (let i = 0; i < _rawtx.length; i++) {
                                if (_rawtx[i].opreturn &&
                                    _rawtx[i].opreturn.kvDecoded) {
                                  _kvTx.push(_rawtx[i]);
                                }
                              }

                              _rawtx = _kvTx;
                            }

                            const retObj = {
                              msg: 'success',
                              result: _rawtx,
                            };
                            resolve();
                          } else {
                            callback();
                          }
                        }
                      });
                    } else {
                      const _parsedTx = {
                        network: 'cant parse',
                        format: 'cant parse',
                        inputs: 'cant parse',
                        outputs: 'cant parse',
                        height: transaction.height,
                        timestamp: 'cant get block info',
                        confirmations: Number(transaction.height) === 0 ? 0 : currentHeight - transaction.height,
                      };
                      const formattedTx = api.parseTransactionAddresses(
                        _parsedTx,
                        _address,
                        network
                      );
                      _rawtx.push(formattedTx);
                      index++;

                      if (index === json.length) {
                        ecl.close();

                        if (isKv) {
                          let _kvTx = [];

                          for (let i = 0; i < _rawtx.length; i++) {
                            if (_rawtx[i].opreturn &&
                                _rawtx[i].opreturn.kvDecoded) {
                              _kvTx.push(_rawtx[i]);
                            }
                          }

                          _rawtx = _kvTx;
                        }

                        const retObj = {
                          msg: 'success',
                          result: _rawtx,
                        };
                        resolve(retObj);
                      } else {
                        callback();
                      }
                    }
                  });
                });
              } else {
                ecl.close();

                const retObj = {
                  msg: 'success',
                  result: [],
                };
                resolve(retObj);
              }
            });
          } else {
            const retObj = {
              msg: 'error',
              result: 'cant get current height',
            };
            resolve(retObj);
          }
        });
      }
    });
  };

  api.get('/electrum/gettransaction', (req, res, next) => {
    if (api.checkToken(req.query.token)) {
      const network = req.query.network || api.findNetworkObj(req.query.coin);
      const ecl = api.ecl(network);

      api.log('electrum gettransaction =>', 'spv.gettransaction');

      ecl.connect();
      ecl.blockchainTransactionGet(req.query.txid)
      .then((json) => {
        ecl.close();
        api.log(json, 'spv.gettransaction');

        const retObj = {
          msg: 'success',
          result: json,
        };

        res.end(JSON.stringify(retObj));
      });
    } else {
      const retObj = {
        msg: 'error',
        result: 'unauthorized access',
      };

      res.end(JSON.stringify(retObj));
    }
  });

  return api;
};