const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const CLAIM_TYPES = ["fact", "evidence_based_inference", "confirmed_preference", "assumption", "unknown"];

const EPISTEMIC_AUDIT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    claims: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      claim: { type: "string" }, type: { type: "string", enum: CLAIM_TYPES }, support: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] }, decisionImpact: { type: "string", enum: ["material", "supporting", "none"] }, validBridge: { type: "boolean" }
    }, required: ["claim", "type", "support", "confidence", "decisionImpact", "validBridge"] } },
    comparisons: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      preferred: { type: "string" }, alternative: { type: "string" }, materialEvidenceDifference: { type: "string" }, supported: { type: "boolean" }, counterfactualResult: { type: "string" }
    }, required: ["preferred", "alternative", "materialEvidenceDifference", "supported", "counterfactualResult"] } },
    hiddenAssumptions: { type: "array", items: { type: "string" } },
    unresolvedComparisons: { type: "array", items: { type: "string" } },
    needsRevision: { type: "boolean" },
    revisionInstructions: { type: "array", items: { type: "string" } }
  },
  required: ["claims", "comparisons", "hiddenAssumptions", "unresolvedComparisons", "needsRevision", "revisionInstructions"]
};

function extractOutputText(response) {
  if (response?.output_text) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) for (const content of item?.content || []) if (content?.type === "output_text" && content?.text) parts.push(content.text);
  return parts.join("\n").trim();
}
function parseJson(text) { return JSON.parse(String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }
function responseWasTruncated(data) { return data?.status === "incomplete" || data?.incomplete_details?.reason === "max_output_tokens"; }
function mergeUsage(...items) {
  const valid = items.filter(Boolean); if (!valid.length) return null;
  const sum = k => valid.reduce((a, u) => a + (Number(u?.[k]) || 0), 0);
  return { input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), total_tokens: sum("total_tokens"), input_tokens_details: { cached_tokens: valid.reduce((a,u)=>a+(Number(u?.input_tokens_details?.cached_tokens)||0),0) }, output_tokens_details: { reasoning_tokens: valid.reduce((a,u)=>a+(Number(u?.output_tokens_details?.reasoning_tokens)||0),0) } };
}

function compactValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 1400 ? `${value.slice(0, 1400)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 5) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0, 20).map(item => compactValue(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactValue(item, depth + 1)]));
}

function compactProfile(profile = {}) {
  return compactValue({
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

function compactPlan(plan = {}) {
  return compactValue({
    decisionType: plan.decisionType,
    candidateUniverse: plan.candidateUniverse,
    requiresQuantitativeAllocation: plan.requiresQuantitativeAllocation,
    allocationAmountUsd: plan.allocationAmountUsd,
    researchQuestions: plan.researchQuestions
  });
}

function buildEpistemicAuditInstructions() {
  return `Sos el Epistemic Auditor del Digital Investment Twin. No investigás hechos nuevos y no tomás la decisión. Auditás un borrador contra la matriz de evidencia, el Investor Model y los datos determinísticos.
PRINCIPIO GENERAL: toda conclusión material debe distinguir dato, inferencia y preferencia. Una inferencia sólo puede mover ranking o asignación si está respaldada por evidencia explícita y existe un puente lógico válido. assumption y unknown nunca pueden mover silenciosamente una decisión.
AUDITÁ SÓLO CLAIMS MATERIALES: no enumeres cada frase del borrador. Priorizá como máximo 12 claims que realmente puedan cambiar ranking, asignación o conclusión.
CLASIFICÁ cada claim material como fact, evidence_based_inference, confirmed_preference, assumption o unknown. Una afirmación plausible no se convierte en evidencia por sonar razonable.
TRAZABILIDAD: para cada diferencia material del ranking, identificá qué evidencia hace preferible A sobre B. Si la evidencia sólo demuestra que ambos son buenos, no alcanza para ordenarlos.
COUNTERFACTUAL CHECK: para cada A > B, eliminá mentalmente la evidencia explícita que diferencia A de B. Si A sigue ganando sólo por una razón no respaldada por evidencia o Investor Model, supported=false y registrá el supuesto oculto.
INCERTIDUMBRE: permití empates. Si dos alternativas no pueden separarse con evidencia, registralas en unresolvedComparisons. No fuerces un ganador.
GENERALIDAD: no uses excepciones ad-hoc por tema. Auditá el origen y puente lógico de cualquier argumento. Un dato descriptivo sólo se transforma en preferencia si Investor Model lo confirma o la evidencia demuestra por qué mejora esta decisión.
Si hay salto lógico material, preferencia inventada, falsa precisión o desempate sin evidencia, needsRevision=true. revisionInstructions explica qué corregir sin imponer otra conclusión.
Mantené support, materialEvidenceDifference y counterfactualResult breves. La auditoría debe ser compacta y accionable.`;
}

async function postResponse(body, timeout = 120000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout })).data;
}

async function requestAudit({ input, maxOutputTokens }) {
  return postResponse({
    model: DEFAULT_MODEL,
    instructions: buildEpistemicAuditInstructions(),
    input,
    max_output_tokens: maxOutputTokens,
    text: { verbosity: "low", format: { type: "json_schema", name: "digital_twin_epistemic_audit", strict: true, schema: EPISTEMIC_AUDIT_SCHEMA } },
    store: false
  });
}

async function auditDecision({ draft, evidenceMatrix, currentProfile, context, plan }) {
  const input = `INVESTOR MODEL:\n${JSON.stringify(compactProfile(currentProfile),null,2)}\n\nDATOS PERSONALES DETERMINÍSTICOS:\n${JSON.stringify(compactValue(context||{}),null,2)}\n\nPRE-FLIGHT ESENCIAL:\n${JSON.stringify(compactPlan(plan),null,2)}\n\nMATRIZ DE EVIDENCIA:\n${JSON.stringify(compactValue(evidenceMatrix||{}),null,2)}\n\nBORRADOR A AUDITAR:\n${String(draft||"").slice(0,14000)}`;

  let data = await requestAudit({ input, maxOutputTokens: 3600 });
  const attempts = [data];
  let audit;
  try {
    if (responseWasTruncated(data)) throw new Error("TRUNCATED_OUTPUT");
    audit = parseJson(extractOutputText(data));
  } catch (error) {
    const truncated = responseWasTruncated(data) || /TRUNCATED_OUTPUT|Unterminated string|Unexpected end of JSON input/i.test(error?.message || "");
    if (!truncated) throw error;
    console.warn("Digital Twin epistemic audit incomplete/invalid; retrying", { status: data?.status, reason: data?.incomplete_details?.reason, usage: data?.usage, error: error?.message });
    data = await requestAudit({ input, maxOutputTokens: 6500 });
    attempts.push(data);
    if (responseWasTruncated(data)) throw new Error("Digital Twin epistemic audit remained truncated after retry");
    audit = parseJson(extractOutputText(data));
  }
  return { audit, data, attempts };
}

async function reviseDecision({ draft, audit, evidenceMatrix, currentProfile, context, plan }) {
  if (!audit?.needsRevision) return { answer: draft, data: null };
  const instructions = `Sos el Digital Investment Twin revisando una decisión después de una auditoría epistemológica. No investigues ni agregues hechos nuevos. Conservá sólo conclusiones respaldadas por la matriz, datos determinísticos o preferencias confirmadas del Investor Model. Corregí todos los puntos de revisionInstructions. assumption/unknown no pueden mover silenciosamente ranking o asignación. Si la evidencia no separa alternativas, declaralo como empate o incertidumbre en vez de inventar un desempate. No conviertas una descripción del portfolio en una preferencia no confirmada. Mantené la estructura y el tono del borrador, en español rioplatense, máximo 700 palabras.`;
  const input = `INVESTOR MODEL:\n${JSON.stringify(compactProfile(currentProfile),null,2)}\n\nDATOS DETERMINÍSTICOS:\n${JSON.stringify(compactValue(context||{}),null,2)}\n\nPRE-FLIGHT ESENCIAL:\n${JSON.stringify(compactPlan(plan),null,2)}\n\nMATRIZ DE EVIDENCIA:\n${JSON.stringify(compactValue(evidenceMatrix||{}),null,2)}\n\nAUDITORÍA:\n${JSON.stringify(compactValue(audit),null,2)}\n\nBORRADOR ORIGINAL:\n${String(draft||"").slice(0,14000)}`;
  const data = await postResponse({ model: DEFAULT_MODEL, instructions, input, max_output_tokens: 4800, text: { verbosity: "low" }, store: false });
  const answer = extractOutputText(data);
  return { answer: answer || draft, data };
}

async function auditAndReviseDecision(args) {
  const { audit, data: auditData, attempts: auditAttempts } = await auditDecision(args);
  const { answer, data: revisionData } = await reviseDecision({ ...args, audit });
  return {
    answer,
    audit,
    usage: mergeUsage(...auditAttempts.map(item => item?.usage), revisionData?.usage),
    apiRequests: auditAttempts.length + (revisionData ? 1 : 0),
    model: revisionData?.model || auditData?.model || DEFAULT_MODEL,
    responseId: revisionData?.id || auditData?.id || null
  };
}

module.exports = { EPISTEMIC_AUDIT_SCHEMA, buildEpistemicAuditInstructions, auditAndReviseDecision };
