const fs = require('fs-extra');
const _fs = require('graceful-fs');
const Promise = require('bluebird');

module.exports = (api) => {
  api.zcashParamsDownloadLinks = {
    'agama.komodoplatform.com': {
      proving: 'https://agama.komodoplatform.com/file/supernet/sprout-proving.key',
      verifying: 'https://agama.komodoplatform.com/file/supernet/sprout-verifying.key',
    },
    'agama-yq0ysrdtr.stackpathdns.com': {
      proving: 'http://agama-yq0ysrdtr.stackpathdns.com/file/supernet/sprout-proving.key',
      verifying: 'http://agama-yq0ysrdtr.stackpathdns.com/file/supernet/sprout-verifying.key',
    },
    'zcash.dl.mercerweiss.com': {
      proving: 'https://zcash.dl.mercerweiss.com/sprout-proving.key',
      verifying: 'https://zcash.dl.mercerweiss.com/sprout-verifying.key',
    },
  };

  api.zcashParamsExist = () => {
    let _checkList = {
      rootDir: _fs.existsSync(api.zcashParamsDir),
      provingKey: _fs.existsSync(`${api.zcashParamsDir}/sprout-proving.key`),
      provingKeySize: false,
      verifyingKey: _fs.existsSync(`${api.zcashParamsDir}/sprout-verifying.key`),
      verifyingKeySize: false,
      errors: false,
    };

    if (_checkList.rootDir &&
        _checkList.provingKey ||
        _checkList.verifyingKey) {
      // verify each key size
      const _provingKeySize = _checkList.provingKey ? fs.lstatSync(`${api.zcashParamsDir}/sprout-proving.key`) : 0;
      const _verifyingKeySize = _checkList.verifyingKey ? fs.lstatSync(`${api.zcashParamsDir}/sprout-verifying.key`) : 0;

      if (Number(_provingKeySize.size) === 910173851) { // bytes
        _checkList.provingKeySize = true;
      }
      if (Number(_verifyingKeySize.size) === 1449) {
        _checkList.verifyingKeySize = true;
      }

      api.log('zcashparams exist', 'native.zcparams');
    } else {
      api.log('zcashparams doesnt exist', 'native.zcparams');
    }

    if (!_checkList.rootDir ||
        !_checkList.provingKey ||
        !_checkList.verifyingKey ||
        !_checkList.provingKeySize ||
        !_checkList.verifyingKeySize) {
      _checkList.errors = true;
    }

    return _checkList;
  }

  api.zcashParamsExistPromise = () => {
    return new Promise((resolve, reject) => {
      const _verify = api.zcashParamsExist();
      resolve(_verify, 'native.zcparams');
    });
  };

  /*
   *  Update bins
   *  type:
   *  params:
   */
  api.get('/zcparamsdl', (req, res, next) => {
    if (api.checkToken(req.query.token)) {
      // const dlLocation = api.zcashParamsDir + '/test';
      const dlLocation = api.zcashParamsDir;
      const dlOption = req.query.dloption;

      const retObj = {
        msg: 'success',
        result: 'zcash params dl started',
      };

      res.end(JSON.stringify(retObj));

      for (let key in api.zcashParamsDownloadLinks[dlOption]) {
        api.downloadFile({
          remoteFile: api.zcashParamsDownloadLinks[dlOption][key],
          localFile: `${dlLocation}/sprout-${key}.key`,
          onProgress: (received, total) => {
            const percentage = (received * 100) / total;

            if (percentage.toString().indexOf('.10') > -1) {
              api.io.emit('zcparams', {
                msg: {
                  type: 'zcpdownload',
                  status: 'progress',
                  file: key,
                  bytesTotal: total,
                  bytesReceived: received,
                  progress: percentage,
                },
              });
              // api.log(`${key} ${percentage}% | ${received} bytes out of ${total} bytes.`);
            }
          }
        })
        .then(() => {
          const checkZcashParams = api.zcashParamsExist();

          api.log(`${key} dl done`, 'native.zcparams');

          if (checkZcashParams.error) {
            api.io.emit('zcparams', {
              msg: {
                type: 'zcpdownload',
                file: key,
                status: 'error',
                message: 'size mismatch',
                progress: 100,
              },
            });
          } else {
            api.io.emit('zcparams', {
              msg: {
                type: 'zcpdownload',
                file: key,
                progress: 100,
                status: 'done',
              },
            });
            api.log(`file ${key} succesfully downloaded`, 'native.zcparams');
          }
        });
      }
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