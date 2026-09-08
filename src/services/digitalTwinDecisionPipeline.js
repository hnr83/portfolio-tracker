const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const WEB_TOOLS = [{ type: "web_search" }];
const RESEARCH_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const researchCache = new Map();

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

function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 700 ? `${value.slice(0, 700)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 4) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0, 12).map(v => compact(v, depth + 1));
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

function compactDecisionContext(context = {}) {
  const portfolio = context?.portfolio || {};
  const planner = context?.planner || {};
  return compact({
    portfolio: {
      totalValueUsd: portfolio.totalValueUsd,
      cryptoExposureUsd: portfolio.cryptoExposureUsd,
      cryptoExposurePct: portfolio.cryptoExposurePct,
      liquidityUsd: portfolio.liquidityUsd,
      liquidityPct: portfolio.liquidityPct,
      exposures: portfolio.exposures,
      topExposures: portfolio.topExposures
    },
    planner: {
      scenarioName: planner.scenarioName,
      monthlyContributionUsd: planner.monthlyContributionUsd,
      horizonYears: planner.horizonYears,
      expectedReturnPct: planner.expectedReturnPct,
      fireGoalUsd: planner.fireGoalUsd
    }
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
  type: "object",
  additionalProperties: false,
  properties: {
    decisionType: { type: "string", enum: ["allocation", "asset_question", "portfolio_risk", "sell_hold", "plan_progress", "other"] },
    missingCriticalInputs: { type: "array", items: { type: "string" } },
    questionForUser: { type: "string" },
    candidateUniverse: { type: "array", items: { type: "string" } },
    researchFocus: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          asset: { type: "string" },
          question: { type: "string" },
          whyDecisionRelevant: { type: "string" }
        },
        required: ["asset", "question", "whyDecisionRelevant"]
      }
    },
    requiresQuantitativeAllocation: { type: "boolean" },
    allocationAmountUsd: { anyOf: [{ type: "number" }, { type: "null" }] }
  },
  required: ["decisionType", "missingCriticalInputs", "questionForUser", "candidateUniverse", "researchFocus", "requiresQuantitativeAllocation", "allocationAmountUsd"]
};

const ASSET_EVIDENCE_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    asset: { type: "string" },
    thesisHealth: { type: "string", enum: ["strengthened", "intact", "mixed", "weakened", "unknown"] },
    thesisEvidence: { type: "string" },
    valuationOpportunity: { type: "string", enum: ["attractive", "neutral", "stretched", "unknown"] },
    valuationEvidence: { type: "string" },
    recentEvidence: { type: "string" },
    evidenceQuality: { type: "string", enum: ["high", "medium", "low"] },
    sourceNotes: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } }
  },
  required: ["asset", "thesisHealth", "thesisEvidence", "valuationOpportunity", "valuationEvidence", "recentEvidence", "evidenceQuality", "sourceNotes", "limitations"]
};

const BATCH_RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assets: { type: "array", maxItems: 4, items: ASSET_EVIDENCE_ITEM },
    globalLimitations: { type: "array", items: { type: "string" } }
  },
  required: ["assets", "globalLimitations"]
};

async function post(body, timeout = 120000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    timeout
  })).data;
}

function preflightInstructions() {
  return `Sos el Decision Planner interno del Digital Investment Twin. No respondas al usuario y no investigues la web. Producí un plan mínimo.
Usá Investor Model, portfolio/Planner determinísticos y conversación. IDENTIDAD != ESTADO. Planner no es target de compra ni reemplaza el monto real del mes.
Para allocation abierta, candidateUniverse debe listar las inversiones actuales económicamente relevantes. No hagas ranking ni screening anticipado.
Elegí researchFocus con COMO MÁXIMO 4 activos cuya evidencia externa actual tenga mayor probabilidad de cambiar la decisión. La selección no implica preferencia ni descarte: sólo prioridad de investigación. Para cada foco escribí una pregunta discriminante que cubra tesis/fundamentales actuales, valuación/precio relativo y evidencia reciente. Si dos activos parecen igualmente relevantes, podés elegir cualquiera y dejar explícito que la cobertura no es exhaustiva.
No inventes porcentajes. allocationAmountUsd sólo puede venir de un monto explícito del usuario.`;
}

async function runPreflight({ messages, context, currentProfile, amount }) {
  const recent = (messages || []).slice(-5).map(m => `${m.role === "assistant" ? "Twin" : "Usuario"}: ${String(m.content || "").slice(0, 1200)}`).join("\n");
  const input = `MONTO EXPLÍCITO: ${amount == null ? "NO INFORMADO" : `USD ${amount}`}\n\nINVESTOR MODEL:\n${JSON.stringify(compactProfile(currentProfile))}\n\nCONTEXTO:\n${JSON.stringify(compactDecisionContext(context))}\n\nCONVERSACIÓN:\n${recent}`;
  const body = max => ({
    model: DEFAULT_MODEL,
    instructions: preflightInstructions(),
    input,
    max_output_tokens: max,
    text: { verbosity: "low", format: { type: "json_schema", name: "digital_twin_bounded_preflight", strict: true, schema: PREFLIGHT_SCHEMA } },
    store: false
  });

  let data = await post(body(1800), 60000);
  const attempts = [data];
  let plan;
  try {
    if (truncated(data)) throw new Error("TRUNCATED_OUTPUT");
    plan = parseJson(outputText(data));
  } catch (error) {
    if (!truncated(data) && !/TRUNCATED_OUTPUT|Unterminated string|Unexpected end of JSON input/i.test(error?.message || "")) throw error;
    console.warn("Digital Twin bounded preflight incomplete/invalid; retrying once", { status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage });
    data = await post(body(3000), 60000);
    attempts.push(data);
    if (truncated(data)) throw new Error("Digital Twin bounded preflight remained truncated after retry");
    plan = parseJson(outputText(data));
  }
  if (amount != null) plan.allocationAmountUsd = amount;
  plan.researchFocus = (plan.researchFocus || []).slice(0, 4);
  return { plan, attempts };
}

function researchCacheKey(asset) {
  return String(asset || "").trim().toUpperCase();
}

function getCachedEvidence(asset) {
  const key = researchCacheKey(asset);
  const item = researchCache.get(key);
  if (!item) return null;
  if (Date.now() - item.fetchedAt > RESEARCH_CACHE_TTL_MS) {
    researchCache.delete(key);
    return null;
  }
  return item.evidence;
}

function putCachedEvidence(evidence) {
  const key = researchCacheKey(evidence?.asset);
  if (!key) return;
  researchCache.set(key, { evidence, fetchedAt: Date.now() });
}

function researchInstructions() {
  return `Sos el Research Analyst del Digital Investment Twin. Investigá SOLAMENTE los activos listados en RESEARCH FOCUS, máximo 4, en UNA sola pasada. No recomiendes compras ni asignes capital.
Para cada activo devolvé una ficha compacta: salud de tesis/fundamentales, valuación u oportunidad al precio actual, evidencia reciente, calidad de evidencia, fuentes y limitaciones.
Priorizá fuentes primarias/oficiales, filings/IR/reguladores y luego Reuters/AP/medios financieros sólidos.
Para cripto, cuando sea verificable, incluí precio actual, ATH relevante y distancia aproximada, pero no confundas distancia al ATH con valuación. Para acciones usá referencias útiles de valuación, crecimiento, FCF/márgenes y expectativas cuando existan.
No uses diversificación, concentración, momentum ni tamaño de posición como prueba de atractivo. Mantené cada campo MUY breve: 1-3 oraciones. Si falta evidencia suficiente, usá unknown y anotá la limitación. No sigas buscando indefinidamente.`;
}

async function researchBatch({ focus }) {
  const cached = [];
  const missing = [];
  for (const item of (focus || []).slice(0, 4)) {
    const hit = getCachedEvidence(item.asset);
    if (hit) cached.push(hit);
    else missing.push(item);
  }

  if (!missing.length) {
    return {
      matrix: { assets: cached, crossAssetNotes: [], researchLimitations: [], cacheHits: cached.map(x => x.asset) },
      attempts: [],
      tools: { webSearchCalls: 0, outputTypes: [] }
    };
  }

  const input = `RESEARCH FOCUS:\n${JSON.stringify(missing.map(item => ({ asset: item.asset, question: item.question, whyDecisionRelevant: item.whyDecisionRelevant })))}`;
  const body = {
    model: DEFAULT_MODEL,
    instructions: researchInstructions(),
    input,
    tools: WEB_TOOLS,
    tool_choice: "auto",
    max_output_tokens: 3000,
    text: { verbosity: "low", format: { type: "json_schema", name: "digital_twin_bounded_research", strict: true, schema: BATCH_RESEARCH_SCHEMA } },
    store: false
  };

  let data;
  try {
    data = await post(body, 180000);
    if (truncated(data)) throw new Error("RESEARCH_TRUNCATED");
    const parsed = parseJson(outputText(data));
    for (const evidence of parsed.assets || []) putCachedEvidence(evidence);
    const researched = parsed.assets || [];
    const allAssets = [...cached, ...researched];
    const missingNames = missing.map(x => researchCacheKey(x.asset)).filter(name => !researched.some(x => researchCacheKey(x.asset) === name));
    const limitations = [...(parsed.globalLimitations || [])];
    if (missingNames.length) limitations.push(`No se obtuvo evidencia suficiente para: ${missingNames.join(", ")}.`);
    return {
      matrix: { assets: allAssets, crossAssetNotes: [], researchLimitations: limitations, cacheHits: cached.map(x => x.asset) },
      attempts: [data],
      tools: summarizeTools(data)
    };
  } catch (error) {
    console.warn("Digital Twin bounded research failed; continuing with available evidence", {
      message: error?.message,
      status: data?.status,
      reason: data?.incomplete_details?.reason,
      usage: data?.usage
    });
    return {
      matrix: {
        assets: cached,
        crossAssetNotes: [],
        researchLimitations: ["La investigación externa de esta corrida quedó incompleta; la decisión no debe inventar evidencia faltante."],
        cacheHits: cached.map(x => x.asset)
      },
      attempts: data ? [data] : [],
      tools: data ? summarizeTools(data) : { webSearchCalls: 0, outputTypes: [] }
    };
  }
}

function decisionInstructions() {
  return `Sos el Digital Investment Twin. Recibís Investor Model, contexto personal determinístico, candidateUniverse completo y evidencia externa sólo para un subconjunto de hasta 4 activos.
No hagas web_search ni introduzcas hechos externos nuevos. La cobertura parcial es deliberada: no inventes un ranking exhaustivo de activos no investigados.
Razoná desde evidencia explícita. Toda diferencia material entre A y B debe estar respaldada por una diferencia material de evidencia; si no existe, admití empate o incertidumbre. No fuerces un ganador.
No conviertas datos descriptivos del portfolio en preferencias. Diversificación o concentración pueden describir impacto marginal, pero no son por sí solas razones de compra/no compra. Peso actual no es identidad.
Para capital nuevo, valuación es central. Estar más lejos del ATH no demuestra por sí solo mayor atractivo. Fundamentals positivos no sustituyen valuación.
Planner no es target ni fallback. El monto válido es preflight.allocationAmountUsd.
Si la evidencia externa falló o fue parcial, igual respondé: explicá qué sí podés concluir, qué queda indeterminado y proponé sólo una implementación coherente con el nivel de confianza. Nunca devuelvas error por falta de research.
Respondé en español rioplatense, directo, máximo 500 palabras. Para allocation abierta: Conclusión; Evidencia disponible y cobertura; Ranking sólo donde esté justificado; Asignación distinguiendo evidencia de criterio práctico; Qué podría cambiar la decisión.`;
}

async function draftDecision({ plan, matrix, currentProfile, context, messages }) {
  const recent = (messages || []).slice(-4).map(m => `${m.role === "assistant" ? "Twin" : "Usuario"}: ${String(m.content || "").slice(0, 1200)}`).join("\n");
  const input = `INVESTOR MODEL:\n${JSON.stringify(compactProfile(currentProfile))}\n\nCONTEXTO:\n${JSON.stringify(compactDecisionContext(context))}\n\nPRE-FLIGHT:\n${JSON.stringify(compact(plan))}\n\nEVIDENCIA:\n${JSON.stringify(compact(matrix))}\n\nCONVERSACIÓN:\n${recent}`;
  const data = await post({
    model: DEFAULT_MODEL,
    instructions: decisionInstructions(),
    input,
    max_output_tokens: 3200,
    text: { verbosity: "low" },
    store: false
  }, 120000);

  let answer = outputText(data);
  if (!answer && truncated(data)) answer = "La evidencia disponible quedó incompleta y no alcanza para justificar una asignación cuantitativa sin inventar supuestos. Con lo que sí está confirmado, mantendría el aporte disponible para una decisión posterior en vez de fabricar un ranking.";
  if (!answer) throw new Error("Digital Twin returned an empty decision response");
  return { answer, attempts: [data], data };
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
      preflight: { decisionType: "allocation", missingCriticalInputs: ["allocationAmountUsd"], questionForUser: "¿Cuánto tenés disponible para invertir este mes?", candidateUniverse: [], researchFocus: [], requiresQuantitativeAllocation: false, allocationAmountUsd: null },
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

  const research = await researchBatch({ focus: plan.researchFocus });
  const drafted = await draftDecision({ plan, matrix: research.matrix, currentProfile, context, messages });
  const allAttempts = [...preflightAttempts, ...research.attempts, ...drafted.attempts];

  return {
    answer: drafted.answer,
    preflight: plan,
    evidenceMatrix: research.matrix,
    usage: mergeUsage(...allAttempts.map(a => a?.usage)),
    apiRequests: allAttempts.length,
    model: drafted.data?.model || DEFAULT_MODEL,
    responseId: drafted.data?.id || null,
    tools: research.tools
  };
}

module.exports = { runDecisionPipeline };
