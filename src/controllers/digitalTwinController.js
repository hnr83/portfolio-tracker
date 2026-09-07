const crypto = require("crypto");
const bigquery = require("../config/bigQuery");
const { runQuery } = require("../services/bigQueryService");
const { runGuidedInterview } = require("../services/digitalTwinLlmService");
const { table } = require("../utils/bigqueryHelper");

const PROFILE_ID = "default";
const LEGACY_SESSION_ID = "default";
const SESSION_TABLE = "digital_twin_interview_sessions";
const MESSAGE_TABLE = "digital_twin_interview_messages";
let interviewTablesReadyPromise = null;

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
    ? messages.slice(-30).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 4000),
      })).filter((m) => m.content.trim())
    : [];
}

async function ensureInterviewTables() {
  if (!interviewTablesReadyPromise) {
    interviewTablesReadyPromise = (async () => {
      const datasetId = process.env.BIGQUERY_DATASET_ID;
      const dataset = bigquery.dataset(datasetId);
      const sessions = dataset.table(SESSION_TABLE);
      const messages = dataset.table(MESSAGE_TABLE);
      const [[sessionsExist], [messagesExist]] = await Promise.all([sessions.exists(), messages.exists()]);
      if (!sessionsExist) {
        await dataset.createTable(SESSION_TABLE, { schema: [
          { name: "id", type: "STRING", mode: "REQUIRED" }, { name: "status", type: "STRING" },
          { name: "context_json", type: "STRING" }, { name: "proposal_json", type: "STRING" },
          { name: "model", type: "STRING" }, { name: "usage_json", type: "STRING" },
          { name: "response_id", type: "STRING" }, { name: "created_at", type: "TIMESTAMP" }, { name: "updated_at", type: "TIMESTAMP" },
        ] });
      }
      if (!messagesExist) {
        await dataset.createTable(MESSAGE_TABLE, { schema: [
          { name: "id", type: "STRING", mode: "REQUIRED" }, { name: "session_id", type: "STRING", mode: "REQUIRED" },
          { name: "sequence", type: "INTEGER", mode: "REQUIRED" }, { name: "role", type: "STRING" },
          { name: "content", type: "STRING" }, { name: "created_at", type: "TIMESTAMP" },
        ] });
      }
    })().catch((error) => { interviewTablesReadyPromise = null; throw error; });
  }
  return interviewTablesReadyPromise;
}

async function loadProfile() {
  const rows = await runQuery(`SELECT * FROM ${table("digital_twin_investor_profile")} WHERE id = @id LIMIT 1`, { id: PROFILE_ID });
  return rows.length ? normalizeProfile(rows[0]) : normalizeProfile();
}

async function loadLegacySession() {
  try {
    const rows = await runQuery(`SELECT * FROM ${table("digital_twin_interview_session")} WHERE id = @id LIMIT 1`, { id: LEGACY_SESSION_ID });
    if (!rows.length) return null;
    const row = rows[0];
    return {
      status: row.status || "active", messages: normalizeMessages(parseJsonValue(row.messages_json, [])),
      context: parseJsonValue(row.context_json, {}), proposal: parseJsonValue(row.proposal_json, null),
      model: row.model || null, usage: parseJsonValue(row.usage_json, null), response_id: row.response_id || null,
    };
  } catch { return null; }
}

async function appendMessages(sessionId, messages, startSequence = 1) {
  const clean = normalizeMessages(messages);
  for (let i = 0; i < clean.length; i += 1) {
    const m = clean[i];
    await runQuery(`INSERT INTO ${table(MESSAGE_TABLE)} (id, session_id, sequence, role, content, created_at)
      VALUES (@id, @sessionId, @sequence, @role, @content, CURRENT_TIMESTAMP())`, {
      id: crypto.randomUUID(), sessionId, sequence: startSequence + i, role: m.role, content: m.content,
    });
  }
}

async function createSession({ messages = [], context = {}, result = null }) {
  await ensureInterviewTables();
  const id = crypto.randomUUID();
  await runQuery(`INSERT INTO ${table(SESSION_TABLE)}
    (id, status, context_json, proposal_json, model, usage_json, response_id, created_at, updated_at)
    VALUES (@id, @status, @contextJson, @proposalJson, @model, @usageJson, @responseId, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`, {
    id, status: result?.phase === "proposal" ? "proposal" : "active", contextJson: JSON.stringify(context || {}),
    proposalJson: result?.proposal ? JSON.stringify(result.proposal) : "", model: result?.model || "",
    usageJson: result?.usage ? JSON.stringify(result.usage) : "", responseId: result?.responseId || "",
  });
  await appendMessages(id, messages, 1);
  return id;
}

async function loadSessionById(id) {
  await ensureInterviewTables();
  const rows = await runQuery(`SELECT * FROM ${table(SESSION_TABLE)} WHERE id = @id LIMIT 1`, { id });
  if (!rows.length) return null;
  const row = rows[0];
  const messageRows = await runQuery(`SELECT role, content, sequence, created_at FROM ${table(MESSAGE_TABLE)} WHERE session_id = @id ORDER BY sequence ASC`, { id });
  return {
    id: row.id, status: row.status || "active", messages: messageRows.map((m) => ({ role: m.role, content: m.content })),
    context: parseJsonValue(row.context_json, {}), proposal: parseJsonValue(row.proposal_json, null), model: row.model || null,
    usage: parseJsonValue(row.usage_json, null), response_id: row.response_id || null,
    created_at: row.created_at?.value || row.created_at || null, updated_at: row.updated_at?.value || row.updated_at || null,
  };
}

async function loadLatestSession() {
  await ensureInterviewTables();
  const rows = await runQuery(`SELECT id FROM ${table(SESSION_TABLE)} WHERE status IN ('active','proposal') ORDER BY updated_at DESC LIMIT 1`);
  if (rows.length) return loadSessionById(rows[0].id);
  const legacy = await loadLegacySession();
  if (!legacy || !legacy.messages.length) return { id: null, status: "new", messages: [], context: {}, proposal: null };
  const migratedId = await createSession({ messages: legacy.messages, context: legacy.context, result: { phase: legacy.status === "proposal" ? "proposal" : "question", proposal: legacy.proposal, model: legacy.model, usage: legacy.usage, responseId: legacy.response_id } });
  return loadSessionById(migratedId);
}

async function persistTurn({ sessionId, priorMessages, userMessages, context, result }) {
  await ensureInterviewTables();
  let id = sessionId;
  if (!id) id = await createSession({ messages: priorMessages, context });
  const existing = await loadSessionById(id);
  if (!existing) throw new Error("Interview session not found");
  const existingCount = existing.messages.length;
  const normalizedIncoming = normalizeMessages(userMessages);
  const missingIncoming = normalizedIncoming.slice(existingCount);
  if (missingIncoming.length) await appendMessages(id, missingIncoming, existingCount + 1);
  const assistantText = result?.question || result?.message || "";
  if (assistantText) await appendMessages(id, [{ role: "assistant", content: assistantText }], existingCount + missingIncoming.length + 1);
  await runQuery(`UPDATE ${table(SESSION_TABLE)} SET status=@status, context_json=@contextJson, proposal_json=@proposalJson,
    model=@model, usage_json=@usageJson, response_id=@responseId, updated_at=CURRENT_TIMESTAMP() WHERE id=@id`, {
    id, status: result?.phase === "proposal" ? "proposal" : "active", contextJson: JSON.stringify(context || existing.context || {}),
    proposalJson: result?.proposal ? JSON.stringify(result.proposal) : "", model: result?.model || "",
    usageJson: result?.usage ? JSON.stringify(result.usage) : "", responseId: result?.responseId || "",
  });
  return id;
}

async function getInvestorProfile(req, res) {
  try { res.json(await loadProfile()); }
  catch (error) { console.error("Error fetching Digital Twin investor profile:", error); res.status(500).json({ error: "Error fetching Digital Twin investor profile" }); }
}

async function getInvestorInterviewSession(req, res) {
  try { res.json(await loadLatestSession()); }
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
    await runQuery(`MERGE ${table("digital_twin_investor_profile")} target USING (SELECT @id AS id, CURRENT_TIMESTAMP() AS updated_at, @style AS style,
      @concentrationTolerance AS concentration_tolerance, @drawdownTolerance AS drawdown_tolerance, @liquidityPreference AS liquidity_preference,
      @implementationStyle AS implementation_style, @convictionsJson AS convictions_json, @rulesJson AS rules_json, @notes AS notes, @investorNarrative AS investor_narrative) source
      ON target.id = source.id WHEN MATCHED THEN UPDATE SET updated_at=source.updated_at, style=source.style, concentration_tolerance=source.concentration_tolerance,
      drawdown_tolerance=source.drawdown_tolerance, liquidity_preference=source.liquidity_preference, implementation_style=source.implementation_style,
      convictions_json=source.convictions_json, rules_json=source.rules_json, notes=source.notes, investor_narrative=source.investor_narrative
      WHEN NOT MATCHED THEN INSERT (id,updated_at,style,concentration_tolerance,drawdown_tolerance,liquidity_preference,implementation_style,convictions_json,rules_json,notes,investor_narrative)
      VALUES(source.id,source.updated_at,source.style,source.concentration_tolerance,source.drawdown_tolerance,source.liquidity_preference,source.implementation_style,source.convictions_json,source.rules_json,source.notes,source.investor_narrative)`, profile);
    res.json(await loadProfile());
  } catch (error) { console.error("Error saving Digital Twin investor profile:", error); res.status(500).json({ error: "Error saving Digital Twin investor profile" }); }
}

async function guidedInvestorInterview(req, res) {
  try {
    const body = req.body || {};
    const incoming = normalizeMessages(body.messages);
    const context = body.context && typeof body.context === "object" ? body.context : {};
    let session = body.session_id ? await loadSessionById(String(body.session_id)) : await loadLatestSession();

    if (!incoming.length && session?.messages?.length) return res.json({ ...session, phase: session.status === "proposal" ? "proposal" : "question", restored: true });

    const messages = incoming.length ? incoming : [];
    const currentProfile = await loadProfile();
    const result = await runGuidedInterview({ messages, context, currentProfile });
    const assistantText = result?.question || result?.message || "";
    const fullMessages = assistantText ? [...messages, { role: "assistant", content: assistantText }] : messages;
    const sessionId = await persistTurn({ sessionId: session?.id || null, priorMessages: session?.messages || [], userMessages: messages, context, result });
    res.json({ ...result, session_id: sessionId, messages: fullMessages });
  } catch (error) {
    console.error("Error running guided Investor Model interview:", error?.response?.data || error);
    if (error.code === "OPENAI_NOT_CONFIGURED") return res.status(503).json({ error: "Digital Twin LLM is not configured", code: error.code });
    res.status(500).json({ error: "Error running guided Investor Model interview" });
  }
}

module.exports = { getInvestorProfile, saveInvestorProfile, getInvestorInterviewSession, guidedInvestorInterview };
