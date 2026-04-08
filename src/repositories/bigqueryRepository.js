const bigquery = require('../config/bigquery');

async function runQuery(query) {
  const [rows] = await bigquery.query({ query });
  return rows;
}

async function insertRows(dataset, table, rows) {
  if (!rows.length) return;
  await bigquery.dataset(dataset).table(table).insert(rows);
}

module.exports = {
  runQuery,
  insertRows,
};