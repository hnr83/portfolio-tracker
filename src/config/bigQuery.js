const { BigQuery } = require('@google-cloud/bigquery');

const projectId = process.env.BIGQUERY_PROJECT_ID;

if (!projectId) {
  throw new Error("Falta BIGQUERY_PROJECT_ID en .env");
}

const bigquery = new BigQuery({
  projectId,
});

module.exports = bigquery;