const fs = require('fs-extra');
const _fs = require('graceful-fs');
const fsnode = require('fs');
const Promise = require('bluebird');

module.exports = (api) => {
  api.loadLocalSPVCache = () => {
    if (fs.existsSync(`${api.agamaDir}/spv-cache.json`)) {
      let localCache = fs.readFileSync(`${api.agamaDir}/spv-cache.json`, 'utf8');

      api.log('local spv cache loaded from local file', 'spv.cache');

      try {
        api.electrumCache = JSON.parse(localCache);
      } catch (e) {
        api.log('local spv cache file is damaged, create new', 'spv.cache');
        api.saveLocalSPVCache();
        api.electrumCache = {};
      }
    } else {
      api.log('local spv cache file is not found, create new', 'spv.cache');
      api.saveLocalSPVCache();
      api.electrumCache = {};
    }
  };

  api.saveLocalSPVCache = () => {
    let spvCacheFileName = `${api.agamaDir}/spv-cache.json`;

    _fs.access(api.agamaDir, fs.constants.R_OK, (err) => {
      if (!err) {
        const FixFilePermissions = () => {
          return new Promise((resolve, reject) => {
            const result = 'spv-cache.json file permissions updated to Read/Write';

            fsnode.chmodSync(spvCacheFileName, '0666');

            setTimeout(() => {
              api.log(result, 'spv.cache');
              api.writeLog(result);
              resolve(result);
            }, 1000);
          });
        }

        const FsWrite = () => {
          return new Promise((resolve, reject) => {
            const result = 'spv-cache.json write file is done';

            const err = fs.writeFileSync(spvCacheFileName,
                        JSON.stringify(api.electrumCache)
                        /*.replace(/,/g, ',\n') // format json in human readable form
                        .replace(/":/g, '": ')
                        .replace(/{/g, '{\n')
                        .replace(/}/g, '\n}')*/, 'utf8');

            if (err)
              return api.log(err, 'spv.cache');

            fsnode.chmodSync(spvCacheFileName, '0666');
            setTimeout(() => {
              api.log(result, 'spv.cache');
              api.log(`spv-cache.json file is created successfully at: ${api.agamaDir}`, 'spv.cache');
              resolve(result);
            }, 2000);
          });
        }

        FsWrite()
        .then(FixFilePermissions());
      }
    });
  }

  /*
   *  type: POST
   *
   */
  api.post('/electrum/cache/delete', (req, res, next) => {
    if (api.checkToken(req.body.token)) {
      api.electrumCache = {};
      api.saveLocalSPVCache();

      const retObj = {
        msg: 'success',
        result: 'spv cache is removed',
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

  api.getTransaction = (txid, network, ecl) => {
    return new Promise((resolve, reject) => {
      if (!api.electrumCache[network]) {
        api.electrumCache[network] = {};
      }
      if (!api.electrumCache[network].tx) {
        api.electrumCache[network].tx = {};
      }

      if (!api.electrumCache[network].tx[txid]) {
        api.log(`electrum raw input tx ${txid}`, 'spv.cache');

        ecl.blockchainTransactionGet(txid)
        .then((_rawtxJSON) => {
          api.electrumCache[network].tx[txid] = _rawtxJSON;
          resolve(_rawtxJSON);
        });
      } else {
        api.log(`electrum cached raw input tx ${txid}`, 'spv.cached');
        resolve(api.electrumCache[network].tx[txid]);
      }
    });
  }

  api.getTransactionDecoded = (txid, network, data) => {
    if (!api.electrumCache[network].txDecoded) {
      api.electrumCache[network].txDecoded = {};
    }

    if (api.electrumCache[network].txDecoded[txid]) {
      api.log(`electrum raw input tx decoded ${txid}`, 'spv.cache');
      return api.electrumCache[network].txDecoded[txid];
    } else {
      if (data) {
        api.electrumCache[network].txDecoded[txid] = data;
      } else {
        return false;
      }
    }
  }

  api.getBlockHeader = (height, network, ecl) => {
    return new Promise((resolve, reject) => {
      if (!api.electrumCache[network]) {
        api.electrumCache[network] = {};
      }
      if (!api.electrumCache[network].blockHeader) {
        api.electrumCache[network].blockHeader = {};
      }

      if (!api.electrumCache[network].blockHeader[height]) {
        api.log(`electrum raw block ${height}`, 'spv.cache');

        ecl.blockchainBlockGetHeader(height)
        .then((_rawtxJSON) => {
          api.electrumCache[network].blockHeader[height] = _rawtxJSON;
          resolve(_rawtxJSON);
        });
      } else {
        api.log(`electrum cached raw block ${height}`, 'spv.cache');
        resolve(api.electrumCache[network].blockHeader[height]);
      }
    });
  }

  return api;
};