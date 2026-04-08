const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({
  projectId: 'project-a4c11095-2051-4d2c-b3c',
});

module.exports = bigquery;