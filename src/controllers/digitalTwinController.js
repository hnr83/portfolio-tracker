const { runQuery } = require("../services/bigQueryService");
const { runGuidedInterview } = require("../services/digitalTwinLlmService");
const { table } = require("../utils/bigqueryHelper");

const PROFILE_ID = "default";

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
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

async function loadProfile() {
  const rows = await runQuery(`SELECT * FROM ${table("digital_twin_investor_profile")} WHERE id = @id LIMIT 1`, { id: PROFILE_ID });
  return rows.length ? normalizeProfile(rows[0]) : normalizeProfile();
}

async function getInvestorProfile(req, res) {
  try { res.json(await loadProfile()); }
  catch (error) { console.error("Error fetching Digital Twin investor profile:", error); res.status(500).json({ error: "Error fetching Digital Twin investor profile" }); }
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
    const messages = Array.isArray(body.messages) ? body.messages.slice(-14).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 4000) })) : [];
    const context = body.context && typeof body.context === "object" ? body.context : {};
    const currentProfile = await loadProfile();
    const result = await runGuidedInterview({ messages, context, currentProfile });
    res.json(result);
  } catch (error) {
    console.error("Error running guided Investor Model interview:", error?.response?.data || error);
    if (error.code === "OPENAI_NOT_CONFIGURED") return res.status(503).json({ error: "Digital Twin LLM is not configured", code: error.code });
    res.status(500).json({ error: "Error running guided Investor Model interview" });
  }
}

module.exports = { getInvestorProfile, saveInvestorProfile, guidedInvestorInterview };
