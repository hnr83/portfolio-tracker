require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { BigQuery } = require("@google-cloud/bigquery");

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID;
const DATASET_ID = process.env.BIGQUERY_DATASET_ID || "portfolio";

const SEED_TABLES = [
  "ticker_master",
  "cedear_master",
  "fx_rates",
];

if (!PROJECT_ID) {
  throw new Error("Falta BIGQUERY_PROJECT_ID en .env");
}

const bigquery = new BigQuery({ projectId: PROJECT_ID });

const ROOT = path.join(__dirname, "..");
const TABLES_DIR = path.join(ROOT, "schema", "tables");
const VIEWS_DIR = path.join(ROOT, "schema", "views");
const SEEDS_DIR = path.join(ROOT, "seeds");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  ensureDir(dir);
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, file), { recursive: true, force: true });
  }
}

function normalizeDdl(ddl) {
  return ddl
    .replaceAll(`\`${PROJECT_ID}.${DATASET_ID}.`, `\`{{PROJECT_ID}}.{{DATASET_ID}}.`)
    .trim() + ";\n";
}

async function runQuery(query) {
  const [rows] = await bigquery.query({ query, location: process.env.BIGQUERY_LOCATION || "US" });
  return rows;
}

async function exportSchema() {
  cleanDir(TABLES_DIR);
  cleanDir(VIEWS_DIR);

  const rows = await runQuery(`
    SELECT
      table_name,
      table_type,
      ddl
    FROM \`${PROJECT_ID}.${DATASET_ID}.INFORMATION_SCHEMA.TABLES\`
    WHERE table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY
      CASE WHEN table_type = 'BASE TABLE' THEN 1 ELSE 2 END,
      table_name
  `);

  for (const row of rows) {
    if (!row.ddl) continue;

    const dir = row.table_type === "VIEW" ? VIEWS_DIR : TABLES_DIR;
    const filename = `${row.table_name}.sql`;

    fs.writeFileSync(
      path.join(dir, filename),
      normalizeDdl(row.ddl),
      "utf8"
    );

    console.log(`Schema exportado: ${row.table_type} ${row.table_name}`);
  }
}

async function exportSeeds() {
  cleanDir(SEEDS_DIR);

  for (const tableName of SEED_TABLES) {
    const destination = path.join(SEEDS_DIR, `${tableName}.jsonl`);

    const rows = await runQuery(`
      SELECT TO_JSON_STRING(t) AS json_row
      FROM \`${PROJECT_ID}.${DATASET_ID}.${tableName}\` t
    `);

    const content = rows.map((r) => r.json_row).join("\n");

    fs.writeFileSync(destination, content ? content + "\n" : "", "utf8");

    console.log(`Seed exportado: ${tableName} (${rows.length} rows)`);
  }
}

async function main() {
  console.log(`Exportando DB desde ${PROJECT_ID}.${DATASET_ID}`);

  await exportSchema();
  await exportSeeds();

  console.log("Export finalizado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});