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
function mergeUsage(...items) {
  const valid = items.filter(Boolean); if (!valid.length) return null;
  const sum = k => valid.reduce((a, u) => a + (Number(u?.[k]) || 0), 0);
  return { input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), total_tokens: sum("total_tokens"), input_tokens_details: { cached_tokens: valid.reduce((a,u)=>a+(Number(u?.input_tokens_details?.cached_tokens)||0),0) }, output_tokens_details: { reasoning_tokens: valid.reduce((a,u)=>a+(Number(u?.output_tokens_details?.reasoning_tokens)||0),0) } };
}

function buildEpistemicAuditInstructions() {
  return `Sos el Epistemic Auditor del Digital Investment Twin. No investigás hechos nuevos y no tomás la decisión. Auditás un borrador contra la matriz de evidencia, el Investor Model y los datos determinísticos.
PRINCIPIO GENERAL: toda conclusión material debe distinguir dato, inferencia y preferencia. Una inferencia sólo puede mover ranking o asignación si está respaldada por evidencia explícita y existe un puente lógico válido. assumption y unknown nunca pueden mover silenciosamente una decisión.
CLASIFICÁ cada claim material como fact, evidence_based_inference, confirmed_preference, assumption o unknown. Una afirmación plausible no se convierte en evidencia por sonar razonable.
TRAZABILIDAD: para cada diferencia material del ranking, identificá qué evidencia hace preferible A sobre B. Si la evidencia sólo demuestra que ambos son buenos, no alcanza para ordenarlos.
COUNTERFACTUAL CHECK: para cada A > B, eliminá mentalmente la evidencia explícita que diferencia A de B. Si A sigue ganando sólo por una razón no respaldada por evidencia o Investor Model, supported=false y registrá el supuesto oculto.
INCERTIDUMBRE: permití empates. Si dos alternativas no pueden separarse con evidencia, registralas en unresolvedComparisons. No fuerces un ganador.
GENERALIDAD: no uses excepciones ad-hoc por tema. Auditá el origen y puente lógico de cualquier argumento. Un dato descriptivo sólo se transforma en preferencia si Investor Model lo confirma o la evidencia demuestra por qué mejora esta decisión.
Si hay salto lógico material, preferencia inventada, falsa precisión o desempate sin evidencia, needsRevision=true. revisionInstructions explica qué corregir sin imponer otra conclusión.`;
}

async function postResponse(body, timeout = 120000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout })).data;
}

async function auditDecision({ draft, evidenceMatrix, currentProfile, context, plan }) {
  const input = `INVESTOR MODEL:\n${JSON.stringify(currentProfile||{},null,2)}\n\nDATOS PERSONALES DETERMINÍSTICOS:\n${JSON.stringify(context||{},null,2)}\n\nPRE-FLIGHT:\n${JSON.stringify(plan||{},null,2)}\n\nMATRIZ DE EVIDENCIA:\n${JSON.stringify(evidenceMatrix||{},null,2)}\n\nBORRADOR A AUDITAR:\n${draft}`;
  const data = await postResponse({ model: DEFAULT_MODEL, instructions: buildEpistemicAuditInstructions(), input, max_output_tokens: 3600, text: { verbosity: "low", format: { type: "json_schema", name: "digital_twin_epistemic_audit", strict: true, schema: EPISTEMIC_AUDIT_SCHEMA } }, store: false });
  return { audit: parseJson(extractOutputText(data)), data };
}

async function reviseDecision({ draft, audit, evidenceMatrix, currentProfile, context, plan }) {
  if (!audit?.needsRevision) return { answer: draft, data: null };
  const instructions = `Sos el Digital Investment Twin revisando una decisión después de una auditoría epistemológica. No investigues ni agregues hechos nuevos. Conservá sólo conclusiones respaldadas por la matriz, datos determinísticos o preferencias confirmadas del Investor Model. Corregí todos los puntos de revisionInstructions. assumption/unknown no pueden mover silenciosamente ranking o asignación. Si la evidencia no separa alternativas, declaralo como empate o incertidumbre en vez de inventar un desempate. No conviertas una descripción del portfolio en una preferencia no confirmada. Mantené la estructura y el tono del borrador, en español rioplatense, máximo 700 palabras.`;
  const input = `INVESTOR MODEL:\n${JSON.stringify(currentProfile||{},null,2)}\n\nDATOS DETERMINÍSTICOS:\n${JSON.stringify(context||{},null,2)}\n\nPRE-FLIGHT:\n${JSON.stringify(plan||{},null,2)}\n\nMATRIZ DE EVIDENCIA:\n${JSON.stringify(evidenceMatrix||{},null,2)}\n\nAUDITORÍA:\n${JSON.stringify(audit,null,2)}\n\nBORRADOR ORIGINAL:\n${draft}`;
  const data = await postResponse({ model: DEFAULT_MODEL, instructions, input, max_output_tokens: 4800, text: { verbosity: "low" }, store: false });
  const answer = extractOutputText(data);
  return { answer: answer || draft, data };
}

async function auditAndReviseDecision(args) {
  const { audit, data: auditData } = await auditDecision(args);
  const { answer, data: revisionData } = await reviseDecision({ ...args, audit });
  return { answer, audit, usage: mergeUsage(auditData?.usage, revisionData?.usage), apiRequests: 1 + (revisionData ? 1 : 0), model: revisionData?.model || auditData?.model || DEFAULT_MODEL, responseId: revisionData?.id || auditData?.id || null };
}

module.exports = { EPISTEMIC_AUDIT_SCHEMA, buildEpistemicAuditInstructions, auditAndReviseDecision };
