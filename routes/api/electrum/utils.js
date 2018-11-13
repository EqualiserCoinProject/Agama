module.exports = (api) => {
  api.sortTransactions = (transactions, sortBy) => {
    return transactions.sort((b, a) => {
      if (a[sortBy ? sortBy : 'height'] < b[sortBy ? sortBy : 'height']) {
        return -1;
      }

      if (a[sortBy ? sortBy : 'height'] > b[sortBy ? sortBy : 'height']) {
        return 1;
      }

      return 0;
    });
  }

  return api;
};