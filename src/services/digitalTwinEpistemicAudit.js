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
  return compact({ decisionType: plan.decisionType, allocationAmountUsd: plan.allocationAmountUsd, researchAssets: plan.researchAssets, researchQuestion: plan.researchQuestion, screenedPortfolioCount: plan.screenedPortfolioCount });
}
function portfolioRows(context = {}) {
  const p = context?.portfolio || {};
  if (Array.isArray(p.exposures) && p.exposures.length) return p.exposures;
  if (Array.isArray(p.topExposures) && p.topExposures.length) return p.topExposures;
  return [];
}
function assetId(row = {}) { return String(row?.ticker || row?.asset || row?.symbol || row?.name || "").trim(); }
function portfolioAssets(context = {}) {
  const seen = new Set();
  const out = [];
  for (const row of portfolioRows(context)) {
    const asset = assetId(row);
    const key = asset.toUpperCase();
    if (!asset || seen.has(key)) continue;
    seen.add(key); out.push(asset);
  }
  return out;
}
function compactContext(context = {}) {
  const p = context?.portfolio || {};
  const top = Array.isArray(p.topExposures) && p.topExposures.length ? p.topExposures : portfolioRows(context).slice(0,10);
  return {
    portfolio: {
      totalValueUsd: p.totalValueUsd,
      cryptoExposurePct: p.cryptoExposurePct,
      liquidityPct: p.liquidityPct,
      topExposures: compact(top.slice(0,10)),
      portfolioAssets: portfolioAssets(context)
    }
  };
}
async function post(body, timeout = 90000) {
  return (await axios.post(OPENAI_RESPONSES_URL, body, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout })).data;
}

async function auditDecision({ draft, evidenceMatrix, currentProfile, context, plan }) {
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera actual COMPLETA: ${JSON.stringify(compactContext(context))}\nPlan: ${JSON.stringify(compactPlan(plan))}\nEvidencia: ${JSON.stringify(compact(evidenceMatrix || {}))}\nBorrador: ${String(draft || "").slice(0,7000)}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Auditá epistemológicamente el borrador sin investigar, sin decidir de nuevo y sin crear metodología nueva. Revisá COMO MÁXIMO 6 claims que puedan cambiar conclusión, ranking o asignación. Clasificá cada uno como fact, evidence_based_inference, confirmed_preference, assumption o unknown. Una inferencia sólo puede mover la decisión si tiene evidencia explícita y un puente lógico válido. assumption/unknown no pueden moverla silenciosamente. Si A>B no está materialmente respaldado, registrá la comparación como no resuelta y permití empate.

UNIVERSO DE CARTERA: portfolioAssets es la lista completa de activos actuales, no sólo las exposiciones principales. El shortlist researchAssets existe sólo para decidir dónde profundizar después de haber screenado toda la cartera; no es el universo de inversión ni un ranking. Si el borrador actúa como si sólo existieran los activos investigados, o introduce un activo externo como si hubiese formado parte del screening de cartera, needsRevision=true. En esta etapa de allocation, un activo externo no debe desplazar activos actuales: el descubrimiento externo es una fase separada posterior.

REGLA DE DEGRADACIÓN: cuando una conclusión sea más fuerte o precisa que la evidencia, REDUCÍ su fuerza/precisión hasta el nivel que la evidencia permite. No intentes conservarla fabricando análisis adicional. Evidencia heterogénea de activos distintos no implica por sí sola una escala común suficiente para ordenar A>B>C. Si el puente comparativo no está explícitamente soportado, degradá el ranking, no sólo los porcentajes.

COBERTURA NO ES EVIDENCIA: que un activo haya sido investigado y otro no, o que uno tenga quality=medium/high mientras otro no tenga evidencia, NO permite preferir el cubierto. Un activo sin cobertura es UNKNOWN/NO EVALUABLE, no inferior. Research coverage determina qué puede evaluarse, no el ranking relativo. Un fallo o incompletitud del research jamás puede convertirse en señal de inversión.

PREFERENCIA VS IMPLEMENTACIÓN: una preferencia general confirmada no autoriza inventar una implementación específica. DCA no implica por sí solo 4 tramos semanales, frecuencia concreta ni split concreto. Si el borrador agrega detalles sin soporte explícito, pedí quitarlos o etiquetarlos como ejemplo opcional.

TRAZABILIDAD DE TRIGGERS: no permitas que el borrador agregue triggers, riesgos o criterios específicos para un activo que figura sin evidencia en evidenceMatrix, salvo que provengan explícitamente del Investor Model. Si el activo está uncovered/unknown, esos triggers también deben omitirse o declararse fuera de cobertura.

PROHIBIDO en revisionInstructions pedir nueva investigación, nuevos datos, escenarios probabilísticos, probabilidades numéricas, sensibilidades macro, DCF/múltiplos nuevos, fórmulas, scores, pesos, thresholds, triggers cuantificados o cualquier modelo/cálculo que no exista ya explícitamente en la evidencia provista.

revisionInstructions sólo puede ordenar acciones sobre material YA DISPONIBLE: eliminar una conclusión no soportada; degradarla a posibilidad/hipótesis; quitar falsa precisión; reclasificarla como preferencia confirmada si realmente figura en Investor Model; declarar empate/incertidumbre/no-evaluable; separar hecho de inferencia; explicitar una limitación existente; o corregir una falsa representación del universo de cartera/screening.

Si hay salto material, falsa precisión, ranking por cobertura, ranking no comparable, implementación inventada, trigger sin evidencia, universo incompleto o preferencia inventada, needsRevision=true. Mantené instrucciones breves y correctivas, no expansivas.`,
    input, max_output_tokens: 1800,
    text: { verbosity: "low", format: { type: "json_schema", name: "twin_epistemic_audit", strict: true, schema: EPISTEMIC_AUDIT_SCHEMA } }, store: false
  });
  if (truncated(data)) throw new Error("Digital Twin epistemic audit truncated; skipped to protect decision budget");
  return { audit: parseJson(outputText(data)), data };
}

async function reviseDecision({ draft, audit, evidenceMatrix, currentProfile, context, plan }) {
  if (!audit?.needsRevision) return { answer: draft, data: null };
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera actual COMPLETA: ${JSON.stringify(compactContext(context))}\nPlan: ${JSON.stringify(compactPlan(plan))}\nEvidencia: ${JSON.stringify(compact(evidenceMatrix || {}))}\nAuditoría: ${JSON.stringify(compact(audit))}\nBorrador: ${String(draft || "").slice(0,7000)}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Revisá el borrador sólo para corregir revisionInstructions usando exclusivamente el material ya disponible. No investigues, no agregues hechos y NO crees nueva metodología para defender la conclusión original. portfolioAssets representa la cartera actual completa: no reduzcas la decisión al shortlist de research. El shortlist es sólo profundidad selectiva después del screening completo. En esta etapa no introduzcas activos externos en la asignación; oportunidad externa es una fase separada. AUSENCIA DE EVIDENCIA NO ES EVIDENCIA NEGATIVA: un activo cubierto no puede ganar sólo porque otro quedó sin research. Si A tiene evidencia y B está uncovered/unknown, describí A como evaluable y B como indeterminado; no construyas A>B. Si la evidencia entre activos no comparte base comparable suficiente, declaralo no resuelto. No conviertas DCA en frecuencia/tramos/splits no confirmados. No agregues triggers ni riesgos específicos de activos sin evidencia en esta corrida. No inventes probabilidades, escenarios, scores, fórmulas, thresholds ni valuaciones. assumption/unknown no pueden desempatar. Conservá conclusiones soportadas. Español rioplatense, directo, máximo 450 palabras.`,
    input, max_output_tokens: 2200, text: { verbosity: "low" }, store: false
  });
  return { answer: outputText(data) || draft, data };
}

async function auditAndReviseDecision(args) {
  const { audit, data: auditData } = await auditDecision(args);
  const { answer, data: revisionData } = await reviseDecision({ ...args, audit });
  return { answer, audit, usage: mergeUsage(auditData?.usage, revisionData?.usage), apiRequests: 1 + (revisionData ? 1 : 0), model: revisionData?.model || auditData?.model || DEFAULT_MODEL, responseId: revisionData?.id || auditData?.id || null };
}

module.exports = { EPISTEMIC_AUDIT_SCHEMA, auditAndReviseDecision };
