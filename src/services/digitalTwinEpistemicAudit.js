const CLAIM_TYPES = ["fact", "evidence_based_inference", "confirmed_preference", "assumption", "unknown"];

const EPISTEMIC_AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          type: { type: "string", enum: CLAIM_TYPES },
          support: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          decisionImpact: { type: "string", enum: ["material", "supporting", "none"] },
          validBridge: { type: "boolean" }
        },
        required: ["claim", "type", "support", "confidence", "decisionImpact", "validBridge"]
      }
    },
    comparisons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          preferred: { type: "string" },
          alternative: { type: "string" },
          materialEvidenceDifference: { type: "string" },
          supported: { type: "boolean" },
          counterfactualResult: { type: "string" }
        },
        required: ["preferred", "alternative", "materialEvidenceDifference", "supported", "counterfactualResult"]
      }
    },
    hiddenAssumptions: { type: "array", items: { type: "string" } },
    unresolvedComparisons: { type: "array", items: { type: "string" } },
    needsRevision: { type: "boolean" },
    revisionInstructions: { type: "array", items: { type: "string" } }
  },
  required: ["claims", "comparisons", "hiddenAssumptions", "unresolvedComparisons", "needsRevision", "revisionInstructions"]
};

function buildEpistemicAuditInstructions() {
  return `Sos el Epistemic Auditor del Digital Investment Twin. No investigás hechos nuevos y no tomás la decisión. Auditás un borrador contra la matriz de evidencia, el Investor Model y los datos determinísticos.

PRINCIPIO GENERAL: toda conclusión material debe distinguir dato, inferencia y preferencia. Una inferencia sólo puede mover ranking o asignación si está respaldada por evidencia explícita y existe un puente lógico válido entre esa evidencia y la conclusión. assumption y unknown nunca pueden mover silenciosamente una decisión.

CLASIFICÁ cada claim material como fact, evidence_based_inference, confirmed_preference, assumption o unknown. Una afirmación plausible no se convierte en evidencia por sonar razonable.

TRAZABILIDAD: para cada diferencia material del ranking, identificá qué evidencia hace preferible A sobre B. Si la evidencia sólo demuestra que ambos son buenos, no alcanza para ordenarlos.

COUNTERFACTUAL CHECK: para cada preferencia A > B, preguntá qué pasa si eliminás la evidencia explícitamente soportada que diferencia A de B. Si A seguiría ganando sólo por una razón no respaldada por evidencia o Investor Model, marcá supported=false y registrá el supuesto oculto.

INCERTIDUMBRE: permití empates y comparaciones unresolved. No fuerces un ganador. Si dos alternativas no pueden separarse con la evidencia disponible, unresolvedComparisons debe decirlo y la revisión debe preservar esa incertidumbre.

NO CREES EXCEPCIONES TEMÁTICAS: no audites usando reglas ad-hoc para cripto, ATH, diversificación, concentración, geografía, momentum u otros temas. Auditá el origen y el puente lógico de CUALQUIER argumento. Un dato descriptivo sólo puede transformarse en preferencia si Investor Model lo confirma o la evidencia demuestra por qué mejora esta decisión.

Si detectás un salto lógico material, una preferencia inventada, falsa precisión o un desempate sin evidencia, needsRevision=true. revisionInstructions debe explicar qué corregir sin imponer una conclusión alternativa.`;
}

module.exports = { EPISTEMIC_AUDIT_SCHEMA, buildEpistemicAuditInstructions };
