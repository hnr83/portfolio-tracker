const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const WEB_TOOLS = [{ type: "web_search" }];
const RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RESEARCH_ASSETS = 3;
const researchCache = new Map();

function outputText(response) {
  if (response?.output_text) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && content?.text) parts.push(content.text);
  }
  return parts.join("\n").trim();
}
function parseJson(text) {
  return JSON.parse(String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
}
function truncated(data) {
  return data?.status === "incomplete" || data?.incomplete_details?.reason === "max_output_tokens";
}
function mergeUsage(...items) {
  const valid = items.filter(Boolean);
  if (!valid.length) return null;
  const sum = key => valid.reduce((a, x) => a + (Number(x?.[key]) || 0), 0);
  return {
    input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), total_tokens: sum("total_tokens"),
    input_tokens_details: { cached_tokens: valid.reduce((a, x) => a + (Number(x?.input_tokens_details?.cached_tokens) || 0), 0) },
    output_tokens_details: { reasoning_tokens: valid.reduce((a, x) => a + (Number(x?.output_tokens_details?.reasoning_tokens) || 0), 0) }
  };
}
function summarizeTools(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  return { webSearchCalls: output.filter(x => x?.type === "web_search_call").length, outputTypes: output.map(x => x?.type).filter(Boolean) };
}
function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 3) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0, 10).map(v => compact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v, depth + 1)]));
}
function compactProfile(profile = {}) {
  return compact({ investor_narrative: profile.investor_narrative, style: profile.style, concentration_tolerance: profile.concentration_tolerance,
    drawdown_tolerance: profile.drawdown_tolerance, liquidity_preference: profile.liquidity_preference,
    implementation_style: profile.implementation_style, convictions: profile.convictions, rules: profile.rules });
}
function compactDecisionContext(context = {}) {
  const p = context?.portfolio || {};
  const planner = context?.planner || {};
  return compact({ portfolio: { totalValueUsd: p.totalValueUsd, cryptoExposurePct: p.cryptoExposurePct, liquidityPct: p.liquidityPct,
    topExposures: p.topExposures || p.exposures }, planner: { scenarioName: planner.scenarioName, horizonYears: planner.horizonYears,
    expectedReturnPct: planner.expectedReturnPct, fireGoalUsd: planner.fireGoalUsd } });
}
function userText(messages = []) {
  return (messages || []).filter(m => m?.role === "user").map(m => String(m.content || "")).join("\n");
}
function looksLikeOpenAllocation(messages = []) {
  const text = userText(messages).toLowerCase();
  return /(ahorro|aporte|disponible|invertir|invierto|inversi[oó]n).*(mes|aporte|cartera|asignaci[oó]n)|asignaci[oó]n.*(aporte|ahorro|mes)/i.test(text);
}
function explicitUsdAmount(messages = []) {
  const users = (messages || []).filter(m => m?.role === "user");
  for (let i = users.length - 1; i >= 0; i--) {
    const raw = String(users[i]?.content || "");
    const match = raw.match(/(?:us\$|usd|u\$s|d[oó]lares?)\s*([\d.,]+)|([\d.,]+)\s*(?:us\$|usd|u\$s|d[oó]lares?)/i);
    if (match) {
      const value = Number(String(match[1] || match[2]).replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  const last = String(users.at(-1)?.content || "").trim();
  if (users.length > 1 && /^\$?\s*[\d.,]+\s*$/.test(last)) {
    const value = Number(last.replace("$", "").trim().replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
async function post(body, timeout = 120000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout })).data;
}

const PREFLIGHT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    decisionType: { type: "string", enum: ["allocation", "asset_question", "portfolio_risk", "sell_hold", "plan_progress", "other"] },
    researchAssets: { type: "array", maxItems: MAX_RESEARCH_ASSETS, items: { type: "string" } },
    researchQuestion: { type: "string" }
  },
  required: ["decisionType", "researchAssets", "researchQuestion"]
};
const EVIDENCE_ITEM = {
  type: "object", additionalProperties: false,
  properties: {
    asset: { type: "string" },
    thesis: { type: "string", enum: ["stronger", "intact", "mixed", "weaker", "unknown"] },
    valuation: { type: "string", enum: ["attractive", "neutral", "stretched", "unknown"] },
    keyFacts: { type: "array", maxItems: 3, items: { type: "string" } },
    quality: { type: "string", enum: ["high", "medium", "low"] },
    limitation: { type: "string" }
  },
  required: ["asset", "thesis", "valuation", "keyFacts", "quality", "limitation"]
};
const RESEARCH_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { assets: { type: "array", maxItems: MAX_RESEARCH_ASSETS, items: EVIDENCE_ITEM }, limitation: { type: "string" } },
  required: ["assets", "limitation"]
};

function fallbackAssets(context = {}) {
  const rows = context?.portfolio?.topExposures || context?.portfolio?.exposures || [];
  return rows.map(x => String(x?.ticker || x?.asset || x?.symbol || x?.name || "").trim()).filter(Boolean).slice(0, MAX_RESEARCH_ASSETS);
}
async function runPreflight({ messages, context, currentProfile, amount }) {
  const recent = (messages || []).slice(-3).map(m => `${m.role}: ${String(m.content || "").slice(0, 700)}`).join("\n");
  const input = `Monto: ${amount == null ? "no informado" : `USD ${amount}`}\nPerfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera/plan: ${JSON.stringify(compactDecisionContext(context))}\nConsulta: ${recent}`;
  const body = {
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Planificá la decisión, sin responderla ni investigar. Elegí como máximo ${MAX_RESEARCH_ASSETS} activos cuya información pública ACTUAL pueda cambiar materialmente la respuesta. Elegirlos no significa preferirlos. No hagas ranking. Devolvé una sola pregunta de research que permita comparar tesis/fundamentales y valuación actual. Planner no es target ni el peso actual es preferencia.`,
    input, max_output_tokens: 1200,
    text: { verbosity: "low", format: { type: "json_schema", name: "twin_preflight", strict: true, schema: PREFLIGHT_SCHEMA } }, store: false
  };
  let data;
  try {
    data = await post(body, 60000);
    if (truncated(data)) throw new Error("PREFLIGHT_TRUNCATED");
    const parsed = parseJson(outputText(data));
    return { plan: { ...parsed, researchAssets: (parsed.researchAssets || []).slice(0, MAX_RESEARCH_ASSETS), allocationAmountUsd: amount }, attempts: [data] };
  } catch (error) {
    console.warn("Digital Twin preflight unavailable; using deterministic fallback", { message: error?.message, usage: data?.usage });
    return { plan: { decisionType: looksLikeOpenAllocation(messages) ? "allocation" : "other", researchAssets: fallbackAssets(context), researchQuestion: "Comparar tesis/fundamentales y valuación actual con evidencia reciente.", allocationAmountUsd: amount, preflightFallback: true }, attempts: data ? [data] : [] };
  }
}

function cacheKey(asset) { return String(asset || "").trim().toUpperCase(); }
function getCached(asset) {
  const item = researchCache.get(cacheKey(asset));
  if (!item) return null;
  if (Date.now() - item.fetchedAt > RESEARCH_CACHE_TTL_MS) { researchCache.delete(cacheKey(asset)); return null; }
  return item.evidence;
}
function putCached(evidence) { if (cacheKey(evidence?.asset)) researchCache.set(cacheKey(evidence.asset), { evidence, fetchedAt: Date.now() }); }

async function researchBatch(plan) {
  const requested = (plan?.researchAssets || []).slice(0, MAX_RESEARCH_ASSETS);
  const cached = requested.map(getCached).filter(Boolean);
  const missing = requested.filter(asset => !getCached(asset));
  if (!missing.length) return { matrix: { assets: cached, limitation: "", cacheHits: cached.map(x => x.asset) }, attempts: [], tools: { webSearchCalls: 0, outputTypes: [] } };

  const body = {
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Investigá sólo estos activos: ${missing.join(", ")}. Una única pasada de web search. No recomiendes ni asignes capital. Para cada activo devolvé: estado de tesis, valuación actual, máximo 3 hechos discriminantes, calidad y una limitación. Sé extremadamente compacto. Priorizá fuentes primarias y fuentes financieras sólidas. Para cripto, ATH/distancia sólo es contexto y no prueba baratura. Para acciones, preferí múltiplos, crecimiento, FCF/márgenes/expectativas. Si no alcanza la evidencia, marcá unknown. No sigas buscando para completar todos los campos.`,
    input: `Pregunta comparativa: ${String(plan?.researchQuestion || "").slice(0, 700)}`,
    tools: WEB_TOOLS, tool_choice: "auto", max_output_tokens: 1800,
    text: { verbosity: "low", format: { type: "json_schema", name: "twin_compact_research", strict: true, schema: RESEARCH_SCHEMA } }, store: false
  };
  let data;
  try {
    data = await post(body, 120000);
    if (truncated(data)) throw new Error("RESEARCH_TRUNCATED");
    const parsed = parseJson(outputText(data));
    (parsed.assets || []).forEach(putCached);
    return { matrix: { assets: [...cached, ...(parsed.assets || [])], limitation: parsed.limitation || "", cacheHits: cached.map(x => x.asset) }, attempts: [data], tools: summarizeTools(data) };
  } catch (error) {
    console.warn("Digital Twin compact research unavailable; continuing without inventing evidence", { message: error?.message, status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage });
    return { matrix: { assets: cached, limitation: "La investigación externa quedó incompleta. No hay evidencia nueva suficiente para desempatar activos no cubiertos.", cacheHits: cached.map(x => x.asset) }, attempts: data ? [data] : [], tools: data ? summarizeTools(data) : { webSearchCalls: 0, outputTypes: [] } };
  }
}

async function draftDecision({ plan, matrix, currentProfile, context, messages }) {
  const recent = (messages || []).slice(-3).map(m => `${m.role}: ${String(m.content || "").slice(0, 900)}`).join("\n");
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nContexto: ${JSON.stringify(compactDecisionContext(context))}\nPlan: ${JSON.stringify(compact(plan))}\nEvidencia: ${JSON.stringify(matrix)}\nConsulta: ${recent}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "medium" },
    instructions: `Sos el Digital Investment Twin. Respondé desde el Investor Model, datos personales determinísticos y evidencia explícita. No uses web ni inventes hechos. La investigación puede cubrir sólo parte de la cartera: no fabriques ranking de lo no investigado. Dato, inferencia y preferencia no son lo mismo. Una diferencia entre activos sólo puede mover ranking/asignación si la evidencia o una preferencia confirmada la sostienen; si no, admití empate/incertidumbre. Diversificación, concentración y distancia al ATH describen contexto pero no son por sí solas prueba de atractivo. Planner no es target. Si el research falló, igual respondé con lo que sí se sabe y marcá lo indeterminado. Para allocation: conclusión, evidencia/cobertura, ranking sólo si está justificado, asignación separando evidencia de criterio práctico, y qué cambiaría la decisión. Español rioplatense, directo, máximo 450 palabras.`,
    input, max_output_tokens: 2800, text: { verbosity: "low" }, store: false
  }, 120000);
  let answer = outputText(data);
  if (!answer && truncated(data)) answer = "La evidencia actual no alcanza para justificar una asignación precisa sin inventar supuestos. Puedo distinguir qué está confirmado y qué falta investigar, pero no fabricar un ganador.";
  if (!answer) throw new Error("Digital Twin returned an empty decision response");
  return { answer, attempts: [data], data };
}

async function runDecisionPipeline({ messages = [], context = {}, currentProfile = {} }) {
  if (!process.env.OPENAI_API_KEY) { const error = new Error("OPENAI_API_KEY is not configured"); error.code = "OPENAI_NOT_CONFIGURED"; throw error; }
  const openAllocation = looksLikeOpenAllocation(messages);
  const amount = openAllocation ? explicitUsdAmount(messages) : null;
  if (openAllocation && amount == null) return {
    answer: "¿Cuánto tenés disponible para invertir este mes?",
    preflight: { decisionType: "allocation", researchAssets: [], allocationAmountUsd: null }, evidenceMatrix: null,
    usage: null, apiRequests: 0, model: DEFAULT_MODEL, responseId: null, tools: { webSearchCalls: 0, outputTypes: [] }
  };

  const { plan, attempts: preflightAttempts } = await runPreflight({ messages, context, currentProfile, amount });
  const research = await researchBatch(plan);
  const drafted = await draftDecision({ plan, matrix: research.matrix, currentProfile, context, messages });
  const allAttempts = [...preflightAttempts, ...research.attempts, ...drafted.attempts];
  return {
    answer: drafted.answer, preflight: plan, evidenceMatrix: research.matrix,
    usage: mergeUsage(...allAttempts.map(a => a?.usage)), apiRequests: allAttempts.length,
    model: drafted.data?.model || DEFAULT_MODEL, responseId: drafted.data?.id || null, tools: research.tools
  };
}

module.exports = { runDecisionPipeline };
