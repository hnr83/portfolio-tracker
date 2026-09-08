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
  return compact({ decisionType: plan.decisionType, allocationAmountUsd: plan.allocationAmountUsd, screenedAssets: plan.screenedAssets,
    screeningComplete: plan.screeningComplete, researchAssets: plan.researchAssets, researchQuestion: plan.researchQuestion,
    screenedPortfolioCount: plan.screenedPortfolioCount });
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
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera actual COMPLETA: ${JSON.stringify(compactContext(context))}\nPlan y screening: ${JSON.stringify(compactPlan(plan))}\nEvidencia profunda: ${JSON.stringify(compact(evidenceMatrix || {}))}\nBorrador: ${String(draft || "").slice(0,7000)}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Auditá epistemológicamente el borrador sin investigar, sin decidir de nuevo y sin crear metodología nueva. Revisá COMO MÁXIMO 6 claims que puedan cambiar conclusión, ranking o asignación. Clasificá cada uno como fact, evidence_based_inference, confirmed_preference, assumption o unknown. Una inferencia sólo puede mover la decisión si tiene evidencia explícita y un puente lógico válido. assumption/unknown no pueden moverla silenciosamente. Si A>B no está materialmente respaldado, registrá la comparación como no resuelta.

SCREENING COMPLETO: portfolioAssets es la lista completa de activos actuales. screenedAssets debe mostrar explícitamente que cada activo fue revisado y por qué quedó research_now o defer. screeningComplete=true sólo es válido si existe un screenedAssets para cada activo. Si el borrador afirma que 'screening completo' ocurrió pero la lista no está completa, needsRevision=true. El screening sólo prueba que el activo fue considerado para prioridad de research; NO prueba que sus fundamentales actuales hayan sido evaluados.

REGLA DE DEGRADACIÓN: cuando una conclusión sea más fuerte o precisa que la evidencia, REDUCÍ su fuerza/precisión hasta el nivel que la evidencia permite. Evidencia heterogénea de activos distintos no implica por sí sola una escala común suficiente para ordenar A>B>C. Si el puente comparativo no está explícitamente soportado, degradá el ranking, no sólo los porcentajes.

COBERTURA NO ES EVIDENCIA: que un activo haya sido investigado y otro no, o que uno tenga quality=medium/high mientras otro no tenga evidencia, NO permite preferir el cubierto. Un activo sin cobertura es UNKNOWN/NO EVALUABLE, no inferior. Research coverage determina qué puede evaluarse, no el ranking relativo.

PROVENIENCIA NUMÉRICA: cualquier número presentado como HECHO, probabilidad, forecast, escenario, métrica, dato de research o threshold debe estar explícitamente presente en Perfil, Cartera, Plan/screening o Evidencia profunda. Si no aparece allí, el número es unsupported y needsRevision=true. No aceptes que el borrador diga 'datos del research' si ese campo o número no existe realmente en evidenceMatrix. El research schema actual contiene thesis, valuation, keyFacts, quality y limitation; NO contiene probabilidades 12m. Por lo tanto probabilidades tipo 20/50/30 son inválidas salvo que estén literalmente en keyFacts. Una asignación propuesta (porcentaje o monto) es distinta: puede ser un JUICIO TÁCTICO nuevo si está claramente etiquetado como propuesta, no como dato ni como resultado mecánico del research, y su dirección tiene puente cualitativo soportado.

PREFERENCIA VS IMPLEMENTACIÓN: una preferencia general confirmada no autoriza inventar una implementación específica. DCA no implica frecuencia, número de tramos ni split operativo.

TRAZABILIDAD DE TRIGGERS: no permitas triggers, riesgos o criterios específicos para un activo sin soporte en evidenceMatrix o Investor Model.

PROHIBIDO en revisionInstructions pedir nueva investigación, nuevos datos, escenarios probabilísticos, probabilidades numéricas, sensibilidades macro, DCF/múltiplos nuevos, fórmulas, scores, pesos, thresholds, triggers cuantificados o cualquier modelo/cálculo que no exista ya explícitamente en la evidencia provista.

revisionInstructions sólo puede ordenar acciones sobre material YA DISPONIBLE: eliminar conclusión/número no soportado; degradar a posibilidad; quitar falsa precisión; reclasificar preferencia confirmada; declarar incertidumbre/no-evaluable; separar hecho de inferencia; explicitar una limitación; o corregir una falsa representación del screening.

Si hay salto material, número factual inventado, falsa atribución al research, ranking por cobertura, ranking no comparable, implementación inventada, trigger sin evidencia, screening incompleto presentado como completo o preferencia inventada, needsRevision=true.`,
    input, max_output_tokens: 1800,
    text: { verbosity: "low", format: { type: "json_schema", name: "twin_epistemic_audit", strict: true, schema: EPISTEMIC_AUDIT_SCHEMA } }, store: false
  });
  if (truncated(data)) throw new Error("Digital Twin epistemic audit truncated; skipped to protect decision budget");
  return { audit: parseJson(outputText(data)), data };
}

async function reviseDecision({ draft, audit, evidenceMatrix, currentProfile, context, plan }) {
  if (!audit?.needsRevision) return { answer: draft, data: null };
  const input = `Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera actual COMPLETA: ${JSON.stringify(compactContext(context))}\nPlan y screening: ${JSON.stringify(compactPlan(plan))}\nEvidencia profunda: ${JSON.stringify(compact(evidenceMatrix || {}))}\nAuditoría: ${JSON.stringify(compact(audit))}\nBorrador: ${String(draft || "").slice(0,7000)}`;
  const data = await post({
    model: DEFAULT_MODEL,
    reasoning: { effort: "low" },
    instructions: `Revisá el borrador sólo para corregir revisionInstructions usando exclusivamente el material ya disponible. No investigues, no agregues hechos y no crees nueva metodología. portfolioAssets es la cartera completa y screenedAssets es la revisión trazable de todos los activos; no llames screening completo si screeningComplete=false. Screening no equivale a research fundamental. AUSENCIA DE EVIDENCIA NO ES EVIDENCIA NEGATIVA: un activo cubierto no gana sólo porque otro quedó sin research. Si la evidencia no es comparable, declaralo no resuelto.

Eliminá cualquier probabilidad, escenario, forecast, métrica, threshold o número presentado como dato que no aparezca literalmente en Perfil/Cartera/Plan/Evidencia profunda. No atribuyas al research campos que el research no contiene. Las probabilidades 12m están prohibidas salvo presencia literal en keyFacts. Podés conservar una asignación numérica propuesta únicamente si queda explícitamente rotulada como juicio táctico del Twin y no como traducción matemática del research; su dirección debe estar soportada por evidencia cualitativa disponible. No conviertas DCA en frecuencia/tramos/splits no confirmados. No agregues triggers específicos sin evidencia. assumption/unknown no pueden desempatar. Español rioplatense, directo, máximo 450 palabras.`,
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
