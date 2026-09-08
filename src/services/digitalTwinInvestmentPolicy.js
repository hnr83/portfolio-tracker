const crypto = require("crypto");
const axios = require("axios");
const bigquery = require("../config/bigQuery");
const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const POLICY_MODEL = process.env.DIGITAL_TWIN_POLICY_MODEL || process.env.DIGITAL_TWIN_RESEARCH_MODEL || "gpt-5-mini";
const POLICY_TABLE = "digital_twin_investment_policy";
let policyTableReadyPromise = null;

const POLICY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    updates: { type: "array", maxItems: 10, items: {
      type: "object", additionalProperties: false,
      properties: {
        asset: { type: "string" }, strategy: { type: "string" },
        amountUsd: { type: ["number", "null"] },
        frequency: { type: ["string", "null"], enum: ["daily", "weekly", "monthly", "other", null] },
        status: { type: "string", enum: ["active", "paused", "stopped"] }
      },
      required: ["asset", "strategy", "amountUsd", "frequency", "status"]
    }},
    needsDecision: { type: "boolean" },
    acknowledgement: { type: "string" }
  },
  required: ["updates", "needsDecision", "acknowledgement"]
};

function outputText(response) {
  if (response?.output_text) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && content?.text) parts.push(content.text);
  }
  return parts.join("\n").trim();
}
function parseJson(text) { return JSON.parse(String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }

async function ensurePolicyTable() {
  if (!policyTableReadyPromise) policyTableReadyPromise = (async () => {
    const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET_ID), policyTable = dataset.table(POLICY_TABLE);
    const [exists] = await policyTable.exists();
    if (!exists) await dataset.createTable(POLICY_TABLE, { schema: [
      { name: "id", type: "STRING", mode: "REQUIRED" }, { name: "asset", type: "STRING", mode: "REQUIRED" },
      { name: "strategy", type: "STRING" }, { name: "amount_usd", type: "FLOAT" }, { name: "frequency", type: "STRING" },
      { name: "status", type: "STRING" }, { name: "source", type: "STRING" }, { name: "source_message", type: "STRING" },
      { name: "created_at", type: "TIMESTAMP" }
    ]});
  })().catch(error => { policyTableReadyPromise = null; throw error; });
  return policyTableReadyPromise;
}

function normalizeUpdate(update = {}) {
  const asset = String(update.asset || "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{2,20}$/.test(asset)) return null;
  const amount = update.amountUsd == null ? null : Number(update.amountUsd);
  return {
    asset,
    strategy: String(update.strategy || "DCA").trim().slice(0, 40) || "DCA",
    amount_usd: Number.isFinite(amount) && amount > 0 ? amount : null,
    frequency: ["daily", "weekly", "monthly", "other"].includes(update.frequency) ? update.frequency : null,
    status: ["active", "paused", "stopped"].includes(update.status) ? update.status : "active"
  };
}

async function extractPolicyIntent(messages = []) {
  const lastUser = [...messages].reverse().find(message => message?.role === "user");
  const text = String(lastUser?.content || "").trim();
  if (!text) return { updates: [], needsDecision: false, acknowledgement: "", usageStage: null };
  if (!process.env.OPENAI_API_KEY) { const error = new Error("OPENAI_API_KEY is not configured"); error.code = "OPENAI_NOT_CONFIGURED"; throw error; }

  const data = (await axios.post(OPENAI_RESPONSES_URL, {
    model: POLICY_MODEL,
    reasoning: { effort: "low" },
    instructions: `Extraé estado operativo de inversión del ÚLTIMO mensaje del usuario. No asesores. Una update sólo existe si el usuario afirma un cambio o estado ACTUAL/YA EJECUTADO con suficiente certeza (ej. "bajé BTC a 100 por día", "BTC está en 150 diarios", "pausé ETH"). Intenciones, hipótesis o consultas ("capaz", "quiero", "debería", "¿qué te parece?") NO son updates salvo que el mismo mensaje también confirme inequívocamente un cambio ya hecho. No infieras montos, frecuencia, activo ni status faltantes. needsDecision=true si además pide opinión/análisis/recomendación; false si sólo informa estado. acknowledgement: confirmación breve en español sólo de los cambios extraídos, sin consejo.`,
    input: text,
    max_output_tokens: 500,
    text: { verbosity: "low", format: { type: "json_schema", name: "investment_policy_intent", strict: true, schema: POLICY_SCHEMA } },
    store: false
  }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 30000 })).data;

  const parsed = parseJson(outputText(data));
  return {
    updates: (parsed.updates || []).map(normalizeUpdate).filter(Boolean),
    needsDecision: Boolean(parsed.needsDecision),
    acknowledgement: String(parsed.acknowledgement || "").slice(0, 500),
    usageStage: { stage: "policy_intent", model: data?.model || POLICY_MODEL, apiRequests: 1, webSearchCalls: 0, usage: data?.usage || null }
  };
}

async function appendPolicyUpdate(update, sourceMessage) {
  await ensurePolicyTable();
  const source = String(sourceMessage || "").slice(0, 1000);
  const previous = await runQuery(`SELECT strategy,amount_usd,frequency,status FROM ${table(POLICY_TABLE)} WHERE asset=@asset ORDER BY created_at DESC,id DESC LIMIT 1`, { asset: update.asset });
  const last = previous[0];
  const sameState = last && String(last.strategy || "DCA") === String(update.strategy || "DCA")
    && (last.amount_usd == null ? null : Number(last.amount_usd)) === (update.amount_usd == null ? null : Number(update.amount_usd))
    && (last.frequency || null) === (update.frequency || null) && String(last.status || "active") === String(update.status || "active");
  if (sameState) return false;
  await runQuery(`INSERT INTO ${table(POLICY_TABLE)} (id,asset,strategy,amount_usd,frequency,status,source,source_message,created_at) VALUES(@id,@asset,@strategy,@amountUsd,@frequency,@status,'twin_chat',@sourceMessage,CURRENT_TIMESTAMP())`, {
    id: crypto.randomUUID(), asset: update.asset, strategy: update.strategy || "DCA", amountUsd: update.amount_usd,
    frequency: update.frequency, status: update.status || "active", sourceMessage: source
  });
  return true;
}

async function interpretAndApplyPolicy(messages = []) {
  const intent = await extractPolicyIntent(messages);
  const lastUser = [...messages].reverse().find(message => message?.role === "user");
  const applied = [];
  for (const update of intent.updates) if (await appendPolicyUpdate(update, lastUser?.content)) applied.push(update);
  return { ...intent, updates: applied };
}

async function loadCurrentInvestmentPolicy() {
  await ensurePolicyTable();
  const rows = await runQuery(`SELECT asset,strategy,amount_usd,frequency,status,source,created_at FROM ${table(POLICY_TABLE)} QUALIFY ROW_NUMBER() OVER (PARTITION BY asset ORDER BY created_at DESC,id DESC)=1 ORDER BY asset`);
  return rows.map(row => ({ asset: row.asset, strategy: row.strategy || "DCA", amountUsd: row.amount_usd == null ? null : Number(row.amount_usd), frequency: row.frequency || null, status: row.status || "active", source: row.source || null, updatedAt: row.created_at?.value || row.created_at || null }));
}

module.exports = { interpretAndApplyPolicy, loadCurrentInvestmentPolicy };
