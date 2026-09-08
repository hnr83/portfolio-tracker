const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const WEB_TOOLS = [{ type: "web_search" }];

function outputText(response) {
  if (response?.output_text) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content?.text) parts.push(content.text);
    }
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
  const sum = key => valid.reduce((acc, item) => acc + (Number(item?.[key]) || 0), 0);
  return {
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    total_tokens: sum("total_tokens"),
    input_tokens_details: { cached_tokens: valid.reduce((a, u) => a + (Number(u?.input_tokens_details?.cached_tokens) || 0), 0) },
    output_tokens_details: { reasoning_tokens: valid.reduce((a, u) => a + (Number(u?.output_tokens_details?.reasoning_tokens) || 0), 0) }
  };
}
function summarizeTools(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  return {
    webSearchCalls: output.filter(item => item?.type === "web_search_call").length,
    outputTypes: output.map(item => item?.type).filter(Boolean)
  };
}
function mergeTools(...items) {
  return {
    webSearchCalls: items.reduce((a, item) => a + (Number(item?.webSearchCalls) || 0), 0),
    outputTypes: [...new Set(items.flatMap(item => item?.outputTypes || []))]
  };
}
function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 5) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0, 18).map(v => compact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v, depth + 1)]));
}
function compactProfile(profile = {}) {
  return compact({
    investor_narrative: profile.investor_narrative,
    style: profile.style,
    concentration_tolerance: profile.concentration_tolerance,
    drawdown_tolerance: profile.drawdown_tolerance,
    liquidity_preference: profile.liquidity_preference,
    implementation_style: profile.implementation_style,
    convictions: profile.convictions,
    rules: profile.rules
  });
}
function userText(messages = []) {
  return (Array.isArray(messages) ? messages : []).filter(m => m?.role === "user").map(m => String(m.content || "")).join("\n");
}
function looksLikeOpenAllocation(messages = []) {
  const text = userText(messages).toLowerCase();
  return /(ahorro|aporte|disponible|invertir|invierto|inversi[oó]n).*(mes|aporte|cartera|asignaci[oó]n)|asignaci[oó]n.*(aporte|ahorro|mes)/i.test(text);
}
function explicitUsdAmount(messages = []) {
  const users = (Array.isArray(messages) ? messages : []).filter(m => m?.role === "user");
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

const PREFLIGHT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    decisionType: { type: "string", enum: ["allocation", "asset_question", "portfolio_risk", "sell_hold", "plan_progress", "other"] },
    missingCriticalInputs: { type: "array", items: { type: "string" } },
    questionForUser: { type: "string" },
    candidateUniverse: { type: "array", items: { type: "string" } },
    researchQuestions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      asset: { type: "string" }, question: { type: "string" }
    }, required: ["asset", "question"] } },
    requiresQuantitativeAllocation: { type: "boolean" },
    allocationAmountUsd: { anyOf: [{ type: "number" }, { type: "null" }] }
  },
  required: ["decisionType", "missingCriticalInputs", "questionForUser", "candidateUniverse", "researchQuestions", "requiresQuantitativeAllocation", "allocationAmountUsd"]
};

const ASSET_EVIDENCE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    asset: { type: "string" },
    thesisHealth: { type: "string", enum: ["strengthened", "intact", "mixed", "weakened", "unknown"] },
    thesisEvidence: { type: "string" },
    valuationOpportunity: { type: "string", enum: ["attractive", "neutral", "stretched", "unknown"] },
    valuationEvidence: { type: "string" },
    recentEvidence: { type: "string" },
    portfolioMarginalImpact: { type: "string" },
    evidenceQuality: { type: "string", enum: ["high", "medium", "low"] },
    relativeAttractiveness: { type: "string", enum: ["high", "medium", "low", "insufficient"] },
    sourceNotes: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } }
  },
  required: ["asset", "thesisHealth", "thesisEvidence", "valuationOpportunity", "valuationEvidence", "recentEvidence", "portfolioMarginalImpact", "evidenceQuality", "relativeAttractiveness", "sourceNotes", "limitations"]
};

async function post(body, timeout = 120000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    timeout
  })).data;
}

function preflightInstructions() {
  return `Sos el Decision Planner interno del Digital Investment Twin. No respondas al usuario y no investigues la web. Producí sólo el mínimo plan necesario para decidir qué investigar.
Usá Investor Model, portfolio/Planner determinísticos y conversación. IDENTIDAD != ESTADO: no infieras preferencias por clase de activo o ticker por el peso actual. Planner no es target de compra ni reemplaza el monto real del mes.
Para allocation abierta, candidateUniverse debe incluir las inversiones actuales económicamente relevantes; CASH/USDT sólo si el usuario pregunta por mantener liquidez. No hagas screening ni shortlist anticipados: antes de research no hay ganadores ni perdedores.
researchQuestions: una pregunta discriminante por activo. Debe pedir suficiente evidencia para evaluar tesis/fundamentales actuales, valuación/precio relativo actual y evidencia reciente. Para cripto incluir precio actual, ATH relevante, distancia al ATH y cambios en uso/adopción/fundamentales. Para acciones incluir precio/valuación frente a múltiplos, crecimiento, FCF/márgenes y expectativas cuando sean útiles.
No inventes porcentajes. allocationAmountUsd sólo puede venir de un monto explícito del usuario.`;
}
async function runPreflight({ messages, context, currentProfile, amount }) {
  const recent = (messages || []).slice(-8).map(m => `${m.role === "assistant" ? "Twin" : "Usuario"}: ${String(m.content || "").slice(0, 2500)}`).join("\n");
  const input = `MONTO EXPLÍCITO: ${amount == null ? "NO INFORMADO" : `USD ${amount}`}\n\nINVESTOR MODEL:\n${JSON.stringify(compactProfile(currentProfile), null, 2)}\n\nCONTEXTO DETERMINÍSTICO:\n${JSON.stringify(compact(context), null, 2)}\n\nCONVERSACIÓN:\n${recent}`;
  const body = max => ({ model: DEFAULT_MODEL, instructions: preflightInstructions(), input, max_output_tokens: max, text: { verbosity: "low", format: { type: "json_schema", name: "digital_twin_compact_preflight", strict: true, schema: PREFLIGHT_SCHEMA } }, store: false });
  let data = await post(body(2200), 60000);
  const attempts = [data];
  let plan;
  try {
    if (truncated(data)) throw new Error("TRUNCATED_OUTPUT");
    plan = parseJson(outputText(data));
  } catch (error) {
    if (!truncated(data) && !/TRUNCATED_OUTPUT|Unterminated string|Unexpected end of JSON input/i.test(error?.message || "")) throw error;
    console.warn("Digital Twin compact preflight incomplete/invalid; retrying", { status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage, error: error?.message });
    data = await post(body(3800), 60000);
    attempts.push(data);
    if (truncated(data)) throw new Error("Digital Twin compact preflight remained truncated after retry");
    plan = parseJson(outputText(data));
  }
  if (amount != null) plan.allocationAmountUsd = amount;
  return { plan, attempts };
}

function researchInstructions(asset) {
  return `Sos el Research Analyst del Digital Investment Twin. Investigá SOLAMENTE ${asset}. No recomiendes una compra ni asignes capital. Devolvé una ficha de evidencia compacta y auditable.
Evaluá por separado salud de tesis/fundamentales, valuación u oportunidad relativa al precio actual, evidencia reciente, impacto marginal en esta cartera y calidad de evidencia.
Priorizá fuentes primarias/oficiales, filings/IR/reguladores y luego Reuters/AP/medios financieros sólidos.
VALUACIÓN: para capital nuevo debe existir referencia cuantitativa cuando sea verificable. Para cripto: precio actual, ATH relevante, % de distancia y si la tesis/uso/adopción se deterioró o mejoró. Estar debajo del ATH no significa barato. Para acciones: precio/valuación y referencias útiles como múltiplos, crecimiento, FCF, márgenes y expectativas. ATH de una acción no sustituye valuación.
Si no hay evidencia suficiente para clasificar valuación, usá unknown. No uses diversificación, concentración, momentum o tamaño de posición como prueba de atractivo. relativeAttractiveness resume la evidencia propia del activo en este ciclo, sin compararlo todavía con otros activos.
Mantené cada campo breve. sourceNotes debe citar nombre/tipo de fuente, no redactar ensayos.`;
}
async function researchOne({ asset, question, currentProfile, context }) {
  const input = `ACTIVO: ${asset}\nPREGUNTA DE RESEARCH: ${question}\n\nINVESTOR MODEL ESENCIAL:\n${JSON.stringify(compactProfile(currentProfile), null, 2)}\n\nCONTEXTO PERSONAL ESENCIAL:\n${JSON.stringify(compact(context), null, 2)}`;
  const body = max => ({ model: DEFAULT_MODEL, instructions: researchInstructions(asset), input, tools: WEB_TOOLS, tool_choice: "auto", max_output_tokens: max, text: { verbosity: "low", format: { type: "json_schema", name: "digital_twin_asset_evidence", strict: true, schema: ASSET_EVIDENCE_SCHEMA } }, store: false });
  let data = await post(body(2600), 180000);
  const attempts = [data];
  let result;
  try {
    if (truncated(data)) throw new Error("TRUNCATED_OUTPUT");
    result = parseJson(outputText(data));
  } catch (error) {
    if (!truncated(data) && !/TRUNCATED_OUTPUT|Unterminated string|Unexpected end of JSON input/i.test(error?.message || "")) throw error;
    console.warn(`Digital Twin research ${asset} incomplete/invalid; retrying`, { status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage, error: error?.message });
    data = await post(body(4400), 180000);
    attempts.push(data);
    if (truncated(data)) throw new Error(`Digital Twin research ${asset} remained truncated after retry`);
    result = parseJson(outputText(data));
  }
  return { result, attempts };
}

async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

async function buildEvidenceMatrix({ plan, currentProfile, context }) {
  const questions = Array.isArray(plan?.researchQuestions) ? plan.researchQuestions : [];
  const universe = Array.isArray(plan?.candidateUniverse) ? plan.candidateUniverse : [];
  const byAsset = new Map(questions.map(q => [String(q.asset || "").trim(), q]));
  const assets = [...new Set(universe.map(String).map(s => s.trim()).filter(Boolean))].slice(0, 10);
  const jobs = assets.map(asset => ({ asset, question: byAsset.get(asset)?.question || `Evaluá tesis/fundamentales actuales, valuación/precio relativo y evidencia reciente de ${asset}.` }));
  const researched = await mapWithConcurrency(jobs, 2, job => researchOne({ ...job, currentProfile, context }));
  return {
    matrix: {
      assets: researched.map(r => r.result),
      crossAssetNotes: [],
      researchLimitations: researched.flatMap(r => r.result?.limitations || [])
    },
    attempts: researched.flatMap(r => r.attempts || [])
  };
}

function decisionInstructions() {
  return `Sos el Digital Investment Twin. Recibís Investor Model, datos determinísticos, un preflight neutral y fichas de evidencia investigadas POR ACTIVO. No hagas web_search ni introduzcas hechos nuevos.
Razoná desde evidencia explícita. Ranking primero y asignación después. Toda diferencia material entre A y B debe estar respaldada por una diferencia material de evidencia; si no existe, admití empate o incertidumbre. No fuerces un ganador.
No conviertas datos descriptivos del portfolio en preferencias. Diversificación o concentración pueden describir impacto marginal, pero no son por sí solas evidencia para comprar/no comprar. Peso actual no es identidad.
Para capital nuevo, valuación es central. Estar más lejos del ATH no demuestra por sí solo mayor atractivo. Fundamentals positivos no sustituyen valuación. Si valuación es unknown, bajá confianza.
Planner no es target ni fallback. El monto válido es preflight.allocationAmountUsd. Si proponés montos exactos, separá claramente qué está soportado por evidencia de qué es sólo una implementación práctica. No inventes precisión.
Respondé en español rioplatense, directo, máximo 650 palabras. Para allocation abierta: Conclusión; Screening post-research; Ranking para este aporte; Asignación (evidencia vs criterio práctico); 2-4 razones; Qué podría cambiar la decisión.`;
}
async function draftDecision({ plan, matrix, currentProfile, context, messages }) {
  const recent = (messages || []).slice(-6).map(m => `${m.role === "assistant" ? "Twin" : "Usuario"}: ${String(m.content || "").slice(0, 2200)}`).join("\n");
  const input = `INVESTOR MODEL:\n${JSON.stringify(compactProfile(currentProfile), null, 2)}\n\nCONTEXTO DETERMINÍSTICO:\n${JSON.stringify(compact(context), null, 2)}\n\nPRE-FLIGHT:\n${JSON.stringify(plan, null, 2)}\n\nEVIDENCIA POR ACTIVO:\n${JSON.stringify(matrix, null, 2)}\n\nCONVERSACIÓN:\n${recent}`;
  const body = max => ({ model: DEFAULT_MODEL, instructions: decisionInstructions(), input, max_output_tokens: max, text: { verbosity: "low" }, store: false });
  let data = await post(body(4200), 120000);
  const attempts = [data];
  let answer = outputText(data);
  if (!answer || truncated(data)) {
    console.warn("Digital Twin compact final decision incomplete/empty; retrying", { status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage });
    data = await post(body(6500), 120000);
    attempts.push(data);
    answer = outputText(data);
  }
  if (!answer) throw new Error("Digital Twin returned an empty decision response");
  return { answer, attempts, data };
}

async function runDecisionPipeline({ messages = [], context = {}, currentProfile = {} }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.code = "OPENAI_NOT_CONFIGURED";
    throw error;
  }
  const openAllocation = looksLikeOpenAllocation(messages);
  const amount = openAllocation ? explicitUsdAmount(messages) : null;
  if (openAllocation && amount == null) {
    return {
      answer: "¿Cuánto tenés disponible para invertir este mes?",
      preflight: { decisionType: "allocation", missingCriticalInputs: ["allocationAmountUsd"], questionForUser: "¿Cuánto tenés disponible para invertir este mes?", candidateUniverse: [], researchQuestions: [], requiresQuantitativeAllocation: false, allocationAmountUsd: null },
      evidenceMatrix: null,
      usage: null,
      apiRequests: 0,
      model: DEFAULT_MODEL,
      responseId: null,
      tools: { webSearchCalls: 0, outputTypes: [] }
    };
  }

  const { plan, attempts: preflightAttempts } = await runPreflight({ messages, context, currentProfile, amount });
  if (openAllocation && amount != null) {
    plan.missingCriticalInputs = [];
    plan.questionForUser = "";
    plan.requiresQuantitativeAllocation = true;
    plan.allocationAmountUsd = amount;
  }
  if (plan.missingCriticalInputs?.length) {
    return {
      answer: plan.questionForUser || `Me falta un dato para decidir: ${plan.missingCriticalInputs[0]}`,
      preflight: plan,
      evidenceMatrix: null,
      usage: mergeUsage(...preflightAttempts.map(a => a?.usage)),
      apiRequests: preflightAttempts.length,
      model: preflightAttempts.at(-1)?.model || DEFAULT_MODEL,
      responseId: preflightAttempts.at(-1)?.id || null,
      tools: { webSearchCalls: 0, outputTypes: [] }
    };
  }

  const { matrix, attempts: researchAttempts } = await buildEvidenceMatrix({ plan, currentProfile, context });
  const drafted = await draftDecision({ plan, matrix, currentProfile, context, messages });
  const allAttempts = [...preflightAttempts, ...researchAttempts, ...drafted.attempts];
  return {
    answer: drafted.answer,
    preflight: plan,
    evidenceMatrix: matrix,
    usage: mergeUsage(...allAttempts.map(a => a?.usage)),
    apiRequests: allAttempts.length,
    model: drafted.data?.model || DEFAULT_MODEL,
    responseId: drafted.data?.id || null,
    tools: mergeTools(...researchAttempts.map(summarizeTools))
  };
}

module.exports = { runDecisionPipeline };
