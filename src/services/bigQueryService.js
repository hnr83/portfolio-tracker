const bigquery = require('../config/bigquery');

async function runQuery(query, params = {}) {
  const [rows] = await bigquery.query({
    query,
    params,
  });

  return rows;
}

module.exports = { runQuery };