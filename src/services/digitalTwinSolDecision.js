const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DECISION_MODEL = process.env.DIGITAL_TWIN_DECISION_MODEL || "gpt-5.6-sol";

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

function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 700 ? `${value.slice(0, 700)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 4) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0, 20).map(v => compact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v, depth + 1)]));
}

async function runSolDecision({ messages = [], context = {}, currentProfile = {}, preflight = {}, evidenceMatrix = {} }) {
  const recent = messages.slice(-3).map(m => `${m.role}: ${String(m.content || "").slice(0, 1000)}`).join("\n");
  const input = `Investor Model: ${JSON.stringify(compact(currentProfile))}\nContexto determinístico: ${JSON.stringify(compact(context))}\nScreening/preflight: ${JSON.stringify(compact(preflight))}\nEvidencia profunda: ${JSON.stringify(compact(evidenceMatrix))}\nConsulta: ${recent}`;

  const instructions = `Sos el Digital Investment Twin. Producí la decisión final directamente, sin web search y usando solamente el contexto y la evidencia recibidos.

Invariantes obligatorias:
1) ESTADO != ATRACTIVO: peso, tamaño, performance o ser posición principal describen estado; no justifican comprar/vender ni desempatan atractivo salvo que la consulta sea explícitamente sobre exposición/riesgo.
2) CALIDAD/COBERTURA != ATRACTIVO: quality=high significa evidencia más confiable, no mejor inversión. research_now/covered tampoco es señal de compra; defer/uncovered no es inferioridad.
3) FUERZA DE CONCLUSIÓN <= FUERZA DEL PUENTE: podés tomar posición y asignar montos como JUICIO TÁCTICO, pero una diferencia grande entre activos exige evidencia comparativa fuerte. Si la evidencia sólo inclina levemente, reflejá esa incertidumbre en la magnitud o en el lenguaje.
4) DECISIÓN PUNTUAL != REGLA FUTURA: esta asignación no crea frecuencia DCA, tramos, timing, top-ups, thresholds ni proporciones para meses futuros salvo regla explícita del Investor Model.
5) CONTEXTO CONOCIDO NO SE PIDE: no pidas datos que ya estén en los inputs ni digas que faltan si pueden calcularse con ellos.
6) PROVENIENCIA: todo número presentado como hecho, métrica, forecast, probabilidad o threshold debe existir explícitamente en inputs. Los montos/porcentajes nuevos de la propuesta son juicio táctico y deben identificarse como tales.
7) SCREENING != RESEARCH FUNDAMENTAL: screeningComplete sólo significa que se consideró trazablemente el universo; no que todos los activos tengan research profundo.
8) Diversificación, concentración y distancia a ATH no son por sí solas evidencia de atractivo.
9) Planner no es target de asignación.

Para una asignación: da una conclusión clara, explica qué fue screening y qué tuvo research profundo, compara sólo con puentes soportados, propone montos concretos si la evidencia permite una decisión y explica brevemente qué evidencia cambiaría esa decisión. No inventes implementación operativa. No fabriques precisión para parecer concluyente. Español rioplatense, directo, máximo 450 palabras.`;

  const data = (await axios.post(OPENAI_RESPONSES_URL, {
    model: DECISION_MODEL,
    reasoning: { effort: "medium" },
    instructions,
    input,
    max_output_tokens: 3200,
    text: { verbosity: "low" },
    store: false
  }, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    timeout: 120000
  })).data;

  const answer = outputText(data);
  if (!answer) throw new Error("Digital Twin Sol decision returned an empty response");
  return {
    answer,
    usage: data?.usage || null,
    apiRequests: 1,
    model: data?.model || DECISION_MODEL,
    responseId: data?.id || null
  };
}

module.exports = { runSolDecision };
