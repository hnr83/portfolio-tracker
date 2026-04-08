const bigquery = require('../config/bigquery');

async function runQuery(query) {
  const [rows] = await bigquery.query({ query });
  return rows;
}

module.exports = { runQuery };