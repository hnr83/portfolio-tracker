const projectId = process.env.BIGQUERY_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET_ID;

if (!projectId || !datasetId) {
  throw new Error("Faltan variables BIGQUERY_* en .env");
}

function table(name) {
  return `\`${projectId}.${datasetId}.${name}\``;
}

module.exports = { table };