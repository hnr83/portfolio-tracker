const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const CLAIM_TYPES = ["fact", "evidence_based_inference", "confirmed_preference", "assumption", "unknown"];

const EPISTEMIC_AUDIT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    claims: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, properties: {
      claim: { type: "string" }, type: { type: "string", enum: CLAIM_TYPES }, support: { type: "string" },
      decisionImpact: { type: "string", enum: ["material", "supporting", "none"] }, validBridge: { type: "boolean" }
    }, required: ["claim", "type", "support", "decisionImpact", "validBridge"] } },
    unresolvedComparisons: { type: "array", maxItems: 4, items: { type: "string" } },
    needsRevision: { type: "boolean" },
    revisionInstructions: { type: "array", maxItems: 4, items: { type: "string" } }
  },
  required: ["claims", "unresolvedComparisons", "needsRevision", "revisionInstructions"]
};

function outputText(response) {
  if (response?.output_text) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) for (const content of item?.content || []) if (content?.type === "output_text" && content?.text) parts.push(content.text);
  return parts.join("\n").trim();
}
function parseJson(text) { return JSON.parse(String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }
function truncated(data) { return data?.status === "incomplete" || data?.incomplete_details?.reason === "max_output_tokens"; }
function mergeUsage(...items) {
  const valid = items.filter(Boolean); if (!valid.length) return null;
  const sum = k => valid.reduce((a, u) => a + (Number(u?.[k]) || 0), 0);
  return { input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), total_tokens: sum("total_tokens"),
    input_tokens_details: { cached_tokens: valid.reduce((a,u)=>a+(Number(u?.input_tokens_details?.cached_tokens)||0),0) },
    output_tokens_details: { reasoning_tokens: valid.reduce((a,u)=>a+(Number(u?.output_tokens_details?.reasoning_tokens)||0),0) } };
}
function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 600 ? `${value.slice(0,600)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 3) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0,10).map(v => compact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, compact(v, depth + 1)]));
}
function compactProfile(profile = {}) {
  return compact({ investor_narrative: profile.investor_narrative, style: profile.style, concentration_tolerance: profile.concentration_tolerance,
    drawdown_tolerance: profile.drawdown_tolerance, liquidity_preference: profile.liquidity_preference,
    implementation_style: profile.implementation_style, convictions: profile.convictions, rules: profile.rules });
}
function compactPlan(plan = {}) {
  return compact({ decisionType: plan.decisionType, allocationAmountUsd: plan.allocationAmountUsd, researchAssets: plan.researchAssets, researchQuestion: plan.researchQuestion });
}
function compactContext(context = {}) {
  const p = context?.portfolio || {};
  const exposures = p.topExposures || p.exposures || [];
  return compact({
    portfolio: {
      totalValueUsd: p.totalValueUsd,
      cryptoExposurePct: p.cryptoExposurePct,
      liquidityPct: p.liquidityPct,
      topExposures: exposures.slice(0, 10)
    }
  });
}
async function post(body, timeout = 90000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout })).data;
}

async function auditDecision({ draft, evidenceMatrix, currentProfile, context, plan }) {
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera actual: ${JSON.stringify(compactContext(context))}\nPlan: ${JSON.stringify(compactPlan(plan))}\nEvidencia: ${JSON.stringify(compact(evidenceMatrix || {}))}\nBorrador: ${String(draft || "").slice(0,7000)}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Auditá epistemológicamente el borrador sin investigar, sin decidir de nuevo y sin crear metodología nueva. Revisá COMO MÁXIMO 6 claims que puedan cambiar conclusión, ranking o asignación. Clasificá cada uno como fact, evidence_based_inference, confirmed_preference, assumption o unknown. Una inferencia sólo puede mover la decisión si tiene evidencia explícita y un puente lógico válido. assumption/unknown no pueden moverla silenciosamente. Si A>B no está materialmente respaldado, registrá la comparación como no resuelta y permití empate.

REGLA DE DEGRADACIÓN: cuando una conclusión sea más fuerte o precisa que la evidencia, REDUCÍ su fuerza/precisión hasta el nivel que la evidencia permite. No intentes conservarla fabricando análisis adicional. Evidencia heterogénea de activos distintos (por ejemplo crecimiento/márgenes vs on-chain/TVL) no implica por sí sola que exista una escala común suficiente para ordenar A>B>C. Si el puente comparativo no está explícitamente soportado, degradá el ranking, no sólo los porcentajes.

PREFERENCIA VS IMPLEMENTACIÓN: una preferencia general confirmada no autoriza inventar una implementación específica. Por ejemplo DCA no implica por sí solo 4 tramos semanales, una frecuencia concreta ni un split concreto. Si el borrador agrega esos detalles sin soporte explícito, pedí quitarlos o etiquetarlos como ejemplo opcional, nunca como regla del usuario.

CANDIDATOS NUEVOS: es válido que el Twin descubra y recomiende un activo que no esté hoy entre las exposiciones principales; no lo rechaces sólo por ser nuevo. Pero si un activo nuevo aparece en el ranking/asignación, debe quedar explícito que es una idea nueva surgida del research y debe existir evidencia material que explique por qué merece competir con las alternativas actuales. El hecho de haber sido elegido por preflight/research NO es evidencia de superioridad. Si aparece sin ese puente, pedí degradarlo a candidato para considerar, no a ganador.

PROHIBIDO en revisionInstructions pedir nueva investigación, nuevos datos, escenarios probabilísticos, probabilidades numéricas, sensibilidades macro, DCF/múltiplos nuevos, fórmulas, scores, pesos, thresholds, triggers cuantificados o cualquier modelo/cálculo que no exista ya explícitamente en la evidencia provista. Tampoco conviertas incertidumbre en una solicitud al usuario si el Twin puede simplemente declararla.

revisionInstructions sólo puede ordenar acciones sobre material YA DISPONIBLE: eliminar una conclusión no soportada; degradarla a posibilidad/hipótesis; quitar falsa precisión; reclasificarla como preferencia confirmada si realmente figura en Investor Model; declarar empate/incertidumbre; separar hecho de inferencia; explicitar una limitación existente; o identificar un activo externo como candidato nuevo en vez de tratarlo como preferencia previa.

Si hay salto material, falsa precisión, ranking no comparable, implementación inventada o preferencia inventada, needsRevision=true. Mantené las instrucciones breves y correctivas, no expansivas.`,
    input, max_output_tokens: 1800,
    text: { verbosity: "low", format: { type: "json_schema", name: "twin_epistemic_audit", strict: true, schema: EPISTEMIC_AUDIT_SCHEMA } }, store: false
  });
  if (truncated(data)) throw new Error("Digital Twin epistemic audit truncated; skipped to protect decision budget");
  return { audit: parseJson(outputText(data)), data };
}

async function reviseDecision({ draft, audit, evidenceMatrix, currentProfile, context, plan }) {
  if (!audit?.needsRevision) return { answer: draft, data: null };
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera actual: ${JSON.stringify(compactContext(context))}\nPlan: ${JSON.stringify(compactPlan(plan))}\nEvidencia: ${JSON.stringify(compact(evidenceMatrix || {}))}\nAuditoría: ${JSON.stringify(compact(audit))}\nBorrador: ${String(draft || "").slice(0,7000)}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Revisá el borrador sólo para corregir revisionInstructions usando exclusivamente el material ya disponible. No investigues, no agregues hechos y NO crees nueva metodología para defender la conclusión original. Si una conclusión excede la evidencia, degradala. Si la evidencia entre activos no comparte una base comparable suficiente, no conserves un ranking sólo porque cada activo tenga evidencia propia: declaralo no resuelto. No conviertas una preferencia general (como DCA) en frecuencia, tramos o splits específicos no confirmados. Un activo fuera de la cartera puede ser una recomendación válida, pero identificálo como candidato nuevo surgido del research y no como preferencia previa; si no hay puente suficiente para ponerlo por encima de las posiciones actuales, presentalo como idea a considerar. No inventes probabilidades, escenarios, scores, fórmulas, thresholds, valuaciones ni triggers cuantitativos. assumption/unknown no pueden desempatar. Conservá conclusiones que sí estén soportadas. Español rioplatense, directo, máximo 450 palabras.`,
    input, max_output_tokens: 2200, text: { verbosity: "low" }, store: false
  });
  return { answer: outputText(data) || draft, data };
}

async function auditAndReviseDecision(args) {
  const { audit, data: auditData } = await auditDecision(args);
  const { answer, data: revisionData } = await reviseDecision({ ...args, audit });
  return {
    answer, audit,
    usage: mergeUsage(auditData?.usage, revisionData?.usage),
    apiRequests: 1 + (revisionData ? 1 : 0),
    model: revisionData?.model || auditData?.model || DEFAULT_MODEL,
    responseId: revisionData?.id || auditData?.id || null
  };
}

module.exports = { EPISTEMIC_AUDIT_SCHEMA, auditAndReviseDecision };
