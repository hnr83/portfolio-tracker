const bigquery = require("../config/bigQuery");
const { runQuery } = require("../services/bigQueryService");
const { runGuidedInterview } = require("../services/digitalTwinLlmService");
const { table } = require("../utils/bigqueryHelper");

const PROFILE_ID = "default";
const INTERVIEW_SESSION_ID = "default";
const INTERVIEW_TABLE = "digital_twin_interview_session";
let interviewTableReadyPromise = null;

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseJsonValue(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeProfile(row = {}) {
  return {
    id: row.id || PROFILE_ID, updated_at: row.updated_at?.value || row.updated_at || null,
    style: row.style || "", concentration_tolerance: row.concentration_tolerance || "",
    drawdown_tolerance: row.drawdown_tolerance || "", liquidity_preference: row.liquidity_preference || "",
    implementation_style: row.implementation_style || "", convictions: parseJsonArray(row.convictions_json),
    rules: parseJsonArray(row.rules_json), notes: row.notes || "", investor_narrative: row.investor_narrative || "",
  };
}

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages.slice(-20).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 4000),
      })).filter((m) => m.content.trim())
    : [];
}

async function ensureInterviewTable() {
  if (!interviewTableReadyPromise) {
    interviewTableReadyPromise = (async () => {
      const datasetId = process.env.BIGQUERY_DATASET_ID;
      const tableRef = bigquery.dataset(datasetId).table(INTERVIEW_TABLE);
      const [exists] = await tableRef.exists();
      if (!exists) {
        await bigquery.dataset(datasetId).createTable(INTERVIEW_TABLE, {
          schema: [
            { name: "id", type: "STRING", mode: "REQUIRED" },
            { name: "status", type: "STRING" },
            { name: "messages_json", type: "STRING" },
            { name: "context_json", type: "STRING" },
            { name: "proposal_json", type: "STRING" },
            { name: "model", type: "STRING" },
            { name: "usage_json", type: "STRING" },
            { name: "response_id", type: "STRING" },
            { name: "created_at", type: "TIMESTAMP" },
            { name: "updated_at", type: "TIMESTAMP" },
          ],
        });
      }
    })().catch((error) => {
      interviewTableReadyPromise = null;
      throw error;
    });
  }
  return interviewTableReadyPromise;
}

async function loadProfile() {
  const rows = await runQuery(`SELECT * FROM ${table("digital_twin_investor_profile")} WHERE id = @id LIMIT 1`, { id: PROFILE_ID });
  return rows.length ? normalizeProfile(rows[0]) : normalizeProfile();
}

async function loadInterviewSession() {
  await ensureInterviewTable();
  const rows = await runQuery(`SELECT * FROM ${table(INTERVIEW_TABLE)} WHERE id = @id LIMIT 1`, { id: INTERVIEW_SESSION_ID });
  if (!rows.length) return { id: INTERVIEW_SESSION_ID, status: "new", messages: [], context: {}, proposal: null, updated_at: null };
  const row = rows[0];
  return {
    id: row.id,
    status: row.status || "active",
    messages: parseJsonValue(row.messages_json, []),
    context: parseJsonValue(row.context_json, {}),
    proposal: parseJsonValue(row.proposal_json, null),
    model: row.model || null,
    usage: parseJsonValue(row.usage_json, null),
    response_id: row.response_id || null,
    created_at: row.created_at?.value || row.created_at || null,
    updated_at: row.updated_at?.value || row.updated_at || null,
  };
}

async function persistInterviewSession({ messages, context, result }) {
  await ensureInterviewTable();
  const assistantText = result?.question || result?.message || "";
  const storedMessages = assistantText
    ? [...normalizeMessages(messages), { role: "assistant", content: String(assistantText).slice(0, 4000) }]
    : normalizeMessages(messages);
  await runQuery(`
    MERGE ${table(INTERVIEW_TABLE)} target
    USING (SELECT @id AS id, @status AS status, @messagesJson AS messages_json, @contextJson AS context_json,
      @proposalJson AS proposal_json, @model AS model, @usageJson AS usage_json, @responseId AS response_id,
      CURRENT_TIMESTAMP() AS updated_at) source
    ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET status = source.status, messages_json = source.messages_json,
      context_json = source.context_json, proposal_json = source.proposal_json, model = source.model,
      usage_json = source.usage_json, response_id = source.response_id, updated_at = source.updated_at
    WHEN NOT MATCHED THEN INSERT (id, status, messages_json, context_json, proposal_json, model, usage_json, response_id, created_at, updated_at)
      VALUES (source.id, source.status, source.messages_json, source.context_json, source.proposal_json,
        source.model, source.usage_json, source.response_id, CURRENT_TIMESTAMP(), source.updated_at)
  `, {
    id: INTERVIEW_SESSION_ID,
    status: result?.phase === "proposal" ? "proposal" : "active",
    messagesJson: JSON.stringify(storedMessages),
    contextJson: JSON.stringify(context || {}),
    proposalJson: result?.proposal ? JSON.stringify(result.proposal) : "",
    model: result?.model || "",
    usageJson: result?.usage ? JSON.stringify(result.usage) : "",
    responseId: result?.responseId || "",
  });
}

async function getInvestorProfile(req, res) {
  try { res.json(await loadProfile()); }
  catch (error) { console.error("Error fetching Digital Twin investor profile:", error); res.status(500).json({ error: "Error fetching Digital Twin investor profile" }); }
}

async function getInvestorInterviewSession(req, res) {
  try { res.json(await loadInterviewSession()); }
  catch (error) { console.error("Error fetching Digital Twin interview session:", error); res.status(500).json({ error: "Error fetching Digital Twin interview session" }); }
}

async function saveInvestorProfile(req, res) {
  try {
    const body = req.body || {};
    const profile = {
      id: PROFILE_ID, style: String(body.style || "").trim(), concentrationTolerance: String(body.concentration_tolerance || "").trim(),
      drawdownTolerance: String(body.drawdown_tolerance || "").trim(), liquidityPreference: String(body.liquidity_preference || "").trim(),
      implementationStyle: String(body.implementation_style || "").trim(), convictionsJson: JSON.stringify(parseJsonArray(body.convictions)),
      rulesJson: JSON.stringify(parseJsonArray(body.rules)), notes: String(body.notes || "").trim(), investorNarrative: String(body.investor_narrative || "").trim(),
    };
    await runQuery(`
      MERGE ${table("digital_twin_investor_profile")} target
      USING (SELECT @id AS id, CURRENT_TIMESTAMP() AS updated_at, @style AS style,
        @concentrationTolerance AS concentration_tolerance, @drawdownTolerance AS drawdown_tolerance,
        @liquidityPreference AS liquidity_preference, @implementationStyle AS implementation_style,
        @convictionsJson AS convictions_json, @rulesJson AS rules_json, @notes AS notes, @investorNarrative AS investor_narrative) source
      ON target.id = source.id
      WHEN MATCHED THEN UPDATE SET updated_at = source.updated_at, style = source.style,
        concentration_tolerance = source.concentration_tolerance, drawdown_tolerance = source.drawdown_tolerance,
        liquidity_preference = source.liquidity_preference, implementation_style = source.implementation_style,
        convictions_json = source.convictions_json, rules_json = source.rules_json, notes = source.notes, investor_narrative = source.investor_narrative
      WHEN NOT MATCHED THEN INSERT (id, updated_at, style, concentration_tolerance, drawdown_tolerance, liquidity_preference,
        implementation_style, convictions_json, rules_json, notes, investor_narrative)
      VALUES (source.id, source.updated_at, source.style, source.concentration_tolerance, source.drawdown_tolerance,
        source.liquidity_preference, source.implementation_style, source.convictions_json, source.rules_json, source.notes, source.investor_narrative)
    `, profile);
    res.json(await loadProfile());
  } catch (error) { console.error("Error saving Digital Twin investor profile:", error); res.status(500).json({ error: "Error saving Digital Twin investor profile" }); }
}

async function guidedInvestorInterview(req, res) {
  try {
    const body = req.body || {};
    const messages = normalizeMessages(body.messages);
    const context = body.context && typeof body.context === "object" ? body.context : {};

    if (messages.length === 0) {
      const existing = await loadInterviewSession();
      if ((existing.status === "active" || existing.status === "proposal") && existing.messages.length > 0) {
        return res.json({
          phase: existing.status === "proposal" ? "proposal" : "question",
          message: "Sesión recuperada",
          question: existing.status === "active" ? existing.messages[existing.messages.length - 1]?.content || "" : "",
          proposal: existing.proposal || null,
          restored: true,
          messages: existing.messages,
          usage: existing.usage || null,
          model: existing.model || null,
          responseId: existing.response_id || null,
        });
      }
    }

    const currentProfile = await loadProfile();
    const result = await runGuidedInterview({ messages, context, currentProfile });
    await persistInterviewSession({ messages, context, result });
    res.json(result);
  } catch (error) {
    console.error("Error running guided Investor Model interview:", error?.response?.data || error);
    if (error.code === "OPENAI_NOT_CONFIGURED") return res.status(503).json({ error: "Digital Twin LLM is not configured", code: error.code });
    res.status(500).json({ error: "Error running guided Investor Model interview" });
  }
}

module.exports = { getInvestorProfile, saveInvestorProfile, getInvestorInterviewSession, guidedInvestorInterview };
