const Promise = require('bluebird');
const reverse = require('buffer-reverse');
const crypto = require('crypto');
const _sha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest();
};
const { getRandomIntInclusive } = require('agama-wallet-lib/src/utils');

module.exports = (api) => {
  // get merkle root
  api.getMerkleRoot = (txid, proof, pos) => {
    let hash = txid;
    let serialized;

    api.log(`getMerkleRoot txid ${txid}`, 'spv.merkle');
    api.log(`getMerkleRoot pos ${pos}`, 'spv.merkle');
    api.log('getMerkleRoot proof', 'spv.merkle');
    api.log(`getMerkleRoot ${proof}`, 'spv.merkle');

    for (i = 0; i < proof.length; i++) {
      const _hashBuff = new Buffer(hash, 'hex');
      const _proofBuff = new Buffer(proof[i], 'hex');

      if ((pos & 1) == 0) {
        serialized = Buffer.concat([
          reverse(_hashBuff),
          reverse(_proofBuff)
        ]);
      } else {
        serialized = Buffer.concat([
          reverse(_proofBuff),
          reverse(_hashBuff)
        ]);
      }

      hash = reverse(_sha256(_sha256(serialized))).toString('hex');
      pos /= 2;
    }

    return hash;
  }

  api.verifyMerkle = (txid, height, serverList, mainServer, network) => {
    // select random server
    const _rnd = getRandomIntInclusive(0, serverList.length - 1);
    const randomServer = serverList[_rnd];
    const _randomServer = randomServer.split(':');
    const _mainServer = mainServer.split(':');

    let ecl = api.ecl(network, {
      ip: _mainServer[0],
      port: _mainServer[1],
      proto: _mainServer[2],
    });

    return new Promise((resolve, reject) => {
      api.log(`main server: ${mainServer}`, 'spv.merkle');
      api.log(`verification server: ${randomServer}`, 'spv.merkle');

      ecl.connect();
      ecl.blockchainTransactionGetMerkle(txid, height)
      .then((merkleData) => {
        if (merkleData &&
            merkleData.merkle &&
            merkleData.pos) {
          api.log('electrum getmerkle =>', 'spv.merkle');
          api.log(merkleData, 'spv.merkle');
          ecl.close();

          const _res = api.getMerkleRoot(
            txid,
            merkleData.merkle,
            merkleData.pos
          );
          api.log(_res, 'spv.merkle');

          ecl = api.ecl(network, {
            ip: _randomServer[0],
            port: _randomServer[1],
            proto: _randomServer[2],
          });
          ecl.connect();

          api.getBlockHeader(height, network, ecl)
          .then((blockInfo) => {
            if (blockInfo &&
                blockInfo.merkle_root) {
              ecl.close();
              api.log('blockinfo =>', 'spv.merkle');
              api.log(blockInfo, 'spv.merkle');
              api.log(blockInfo.merkle_root, 'spv.merkle');

              if (blockInfo &&
                  blockInfo.merkle_root) {
                if (_res === blockInfo.merkle_root) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              } else {
                ecl.close();
                resolve(api.CONNECTION_ERROR_OR_INCOMPLETE_DATA);
              }
            } else {
              ecl.close();
              resolve(api.CONNECTION_ERROR_OR_INCOMPLETE_DATA);
            }
          });
        } else {
          ecl.close();
          resolve(api.CONNECTION_ERROR_OR_INCOMPLETE_DATA);
        }
      });
    });
  }

  api.verifyMerkleByCoin = (coin, txid, height) => {
    const _serverList = api.electrumCoins[coin].serverList;
    const _server = api.electrumCoins[coin].server;

    api.log('verifyMerkleByCoin', 'spv.merkle');
    api.log(_server, 'spv.merkle');
    api.log(api.electrumCoins[coin].serverList, 'spv.merkle');

    return new Promise((resolve, reject) => {
      if (_serverList !== 'none') {
        let _filteredServerList = [];

        for (let i = 0; i < _serverList.length; i++) {
          if (_serverList[i] !== _server.ip + ':' + _server.port + ':' + _server.proto) {
            _filteredServerList.push(_serverList[i]);
          }
        }

        api.verifyMerkle(
          txid,
          height,
          _filteredServerList,
          _server.ip + ':' + _server.port + ':' + api.electrumCoins[coin.toLowerCase() === 'kmd' || coin === 'komodo' ? 'kmd' : coin].server.proto,
          coin
        )
        .then((proof) => {
          resolve(proof);
        });
      } else {
        resolve(false);
      }
    });
  }

  api.get('/electrum/merkle/verify', (req, res, next) => {
    if (api.checkToken(req.query.token)) {
      const _coin = req.query.coin;
      const _txid = req.query.txid;
      const _height = req.query.height;

      api.verifyMerkleByCoin(_coin, _txid, _height)
      .then((verifyMerkleRes) => {
        const retObj = {
          msg: 'success',
          result: {
            merkleProof: verifyMerkleRes,
          },
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