/* This module exports the api token for easing use of API from third party software. Disable it in ../api.js if you have security concerns.*/
module.exports = (api) => {
  /*
   *  type: GET
   *  params: none
   */
  api.get('/token', async (req, res, next) => {
    res.end(api.appSessionHash);
  });
  return api;
};
