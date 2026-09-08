const crypto = require("crypto");
const bigquery = require("../config/bigQuery");
const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const POLICY_TABLE = "digital_twin_investment_policy";
let policyTableReadyPromise = null;

async function ensurePolicyTable() {
  if (!policyTableReadyPromise) {
    policyTableReadyPromise = (async () => {
      const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET_ID);
      const policyTable = dataset.table(POLICY_TABLE);
      const [exists] = await policyTable.exists();
      if (!exists) {
        await dataset.createTable(POLICY_TABLE, {
          schema: [
            { name: "id", type: "STRING", mode: "REQUIRED" },
            { name: "asset", type: "STRING", mode: "REQUIRED" },
            { name: "strategy", type: "STRING" },
            { name: "amount_usd", type: "FLOAT" },
            { name: "frequency", type: "STRING" },
            { name: "status", type: "STRING" },
            { name: "source", type: "STRING" },
            { name: "source_message", type: "STRING" },
            { name: "created_at", type: "TIMESTAMP" }
          ]
        });
      }
    })().catch(error => {
      policyTableReadyPromise = null;
      throw error;
    });
  }
  return policyTableReadyPromise;
}

function normalizeAsset(value = "") {
  const asset = String(value).trim().toUpperCase();
  return /^[A-Z0-9.-]{2,12}$/.test(asset) ? asset : null;
}

function parseAmount(raw) {
  if (raw == null) return null;
  const normalized = String(raw).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeFrequency(text = "") {
  const value = String(text).toLowerCase();
  if (/diari[oa]|por\s+d[ií]a|cada\s+d[ií]a/.test(value)) return "daily";
  if (/semanal|por\s+semana|cada\s+semana/.test(value)) return "weekly";
  if (/mensual|por\s+mes|cada\s+mes/.test(value)) return "monthly";
  return null;
}

function isDefiniteChange(text = "") {
  return /\b(baj[eé]|sub[ií]|cambi[eé]|ajust[eé]|dej[eé]|puse|pas[eé]|ahora|est[aá]\s+en|queda|qued[oó]|compr[oa]|paus[eé]|pause|detuve|cancel[eé]|reactiv[eé]|activ[eé]|reinici[eé])\b/i.test(text)
    && !/\b(capaz|quiz[aá]s|tal\s+vez|estoy\s+pensando|pensar[ií]a|podr[ií]a|quiero\s+evaluar|convendr[ií]a)\b/i.test(text);
}

function extractPolicyUpdates(message = "") {
  const text = String(message || "").trim();
  if (!text || !isDefiniteChange(text)) return [];

  const updates = [];
  const seen = new Set();
  const push = update => {
    if (!update?.asset) return;
    const key = `${update.asset}:${update.status || "active"}:${update.amount_usd ?? ""}:${update.frequency || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    updates.push(update);
  };

  // Explicit pauses/stops. Amount/frequency are intentionally left null: the event means
  // "inactive now", while previous rows preserve the historical schedule.
  const pauseRegex = /\b(?:paus[eé]|pause|detuve|cancel[eé])\b[^.!?\n]{0,60}?\b(?:dca|bot)?\s*(?:de\s+)?([A-Z]{2,10})\b/gi;
  let match;
  while ((match = pauseRegex.exec(text))) {
    const asset = normalizeAsset(match[1]);
    if (asset) push({ asset, strategy: "DCA", amount_usd: null, frequency: null, status: "paused" });
  }

  // Clear active schedules: "BTC 150 diarios", "ETH compra USD 250 por semana",
  // "bajé el bot de BTC de 150 a 100 diarios" (last amount in the clause wins).
  const assetRegex = /\b([A-Z]{2,10})\b([^.!?\n]{0,100})/gi;
  while ((match = assetRegex.exec(text))) {
    const asset = normalizeAsset(match[1]);
    if (!asset) continue;
    const clause = match[2] || "";
    const frequency = normalizeFrequency(clause);
    if (!frequency) continue;
    const amounts = [...clause.matchAll(/(?:us\$|usd|u\$s|\$)?\s*([0-9][0-9.,]*)/gi)]
      .map(x => parseAmount(x[1]))
      .filter(Number.isFinite);
    if (!amounts.length) continue;
    push({ asset, strategy: "DCA", amount_usd: amounts.at(-1), frequency, status: "active" });
  }

  return updates.slice(0, 10);
}

async function appendPolicyUpdate(update, sourceMessage) {
  await ensurePolicyTable();
  await runQuery(
    `INSERT INTO ${table(POLICY_TABLE)} (id,asset,strategy,amount_usd,frequency,status,source,source_message,created_at)
     VALUES(@id,@asset,@strategy,@amountUsd,@frequency,@status,'twin_chat',@sourceMessage,CURRENT_TIMESTAMP())`,
    {
      id: crypto.randomUUID(),
      asset: update.asset,
      strategy: update.strategy || "DCA",
      amountUsd: update.amount_usd == null ? null : Number(update.amount_usd),
      frequency: update.frequency || null,
      status: update.status || "active",
      sourceMessage: String(sourceMessage || "").slice(0, 1000)
    }
  );
}

async function applyPolicyUpdatesFromMessages(messages = []) {
  const lastUser = [...(messages || [])].reverse().find(message => message?.role === "user");
  if (!lastUser?.content) return [];
  const updates = extractPolicyUpdates(lastUser.content);
  for (const update of updates) await appendPolicyUpdate(update, lastUser.content);
  return updates;
}

async function loadCurrentInvestmentPolicy() {
  await ensurePolicyTable();
  const rows = await runQuery(
    `SELECT asset,strategy,amount_usd,frequency,status,source,created_at
     FROM ${table(POLICY_TABLE)}
     QUALIFY ROW_NUMBER() OVER (PARTITION BY asset ORDER BY created_at DESC, id DESC)=1
     ORDER BY asset`
  );
  return rows.map(row => ({
    asset: row.asset,
    strategy: row.strategy || "DCA",
    amountUsd: row.amount_usd == null ? null : Number(row.amount_usd),
    frequency: row.frequency || null,
    status: row.status || "active",
    source: row.source || null,
    updatedAt: row.created_at?.value || row.created_at || null
  }));
}

module.exports = {
  extractPolicyUpdates,
  applyPolicyUpdatesFromMessages,
  loadCurrentInvestmentPolicy
};
