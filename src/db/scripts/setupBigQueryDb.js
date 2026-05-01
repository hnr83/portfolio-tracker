require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { BigQuery } = require("@google-cloud/bigquery");

const TARGET_PROJECT_ID =
  process.env.BIGQUERY_TARGET_PROJECT_ID || process.env.BIGQUERY_PROJECT_ID;

const TARGET_DATASET_ID =
  process.env.BIGQUERY_TARGET_DATASET_ID || process.env.BIGQUERY_DATASET_ID || "portfolio";

const LOCATION = process.env.BIGQUERY_LOCATION || "US";

if (!TARGET_PROJECT_ID) {
  throw new Error("Falta BIGQUERY_TARGET_PROJECT_ID o BIGQUERY_PROJECT_ID en .env");
}

const bigquery = new BigQuery({ projectId: TARGET_PROJECT_ID });

const ROOT = path.join(__dirname, "..");
const TABLES_DIR = path.join(ROOT, "schema", "tables");
const VIEWS_DIR = path.join(ROOT, "schema", "views");
const SEEDS_DIR = path.join(ROOT, "seeds");

function readSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      sql: fs.readFileSync(path.join(dir, file), "utf8")
        .replaceAll("{{PROJECT_ID}}", TARGET_PROJECT_ID)
        .replaceAll("{{DATASET_ID}}", TARGET_DATASET_ID),
    }));
}

async function runQuery(query) {
  await bigquery.query({ query, location: LOCATION });
}

async function ensureDataset() {
  const dataset = bigquery.dataset(TARGET_DATASET_ID);
  const [exists] = await dataset.exists();

  if (!exists) {
    await dataset.create({ location: LOCATION });
    console.log(`Dataset creado: ${TARGET_PROJECT_ID}.${TARGET_DATASET_ID}`);
  } else {
    console.log(`Dataset existente: ${TARGET_PROJECT_ID}.${TARGET_DATASET_ID}`);
  }
}

async function runSqlDir(dir, label) {
  const files = readSqlFiles(dir);

  for (const item of files) {
    console.log(`Ejecutando ${label}: ${item.file}`);
    await runQuery(item.sql);
  }
}

async function loadSeeds() {
  if (!fs.existsSync(SEEDS_DIR)) return;

  const files = fs
    .readdirSync(SEEDS_DIR)
    .filter((file) => file.endsWith(".jsonl"))
    .sort();

  for (const file of files) {
    const tableName = file.replace(".jsonl", "");
    const filePath = path.join(SEEDS_DIR, file);

    if (fs.statSync(filePath).size === 0) {
      console.log(`Seed vacío, salteado: ${tableName}`);
      continue;
    }

    console.log(`Cargando seed: ${tableName}`);

    await bigquery
      .dataset(TARGET_DATASET_ID)
      .table(tableName)
      .load(filePath, {
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        writeDisposition: "WRITE_TRUNCATE",
      });
  }
}

async function main() {
  console.log(`Instalando DB en ${TARGET_PROJECT_ID}.${TARGET_DATASET_ID}`);

  await ensureDataset();

  await runSqlDir(TABLES_DIR, "tabla");
  await loadSeeds();
  await runSqlDir(VIEWS_DIR, "vista");

  console.log("Setup DB finalizado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});