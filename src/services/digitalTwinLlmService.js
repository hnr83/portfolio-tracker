const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";

function extractOutputText(response) {
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
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function buildInstructions() {
  return `Sos el entrevistador del Digital Investment Twin. Tu objetivo es entender cómo decide esta persona como inversor, no clasificarla con un test de broker ni darle asesoramiento de inversión en esta etapa.

Hacé UNA sola pregunta por turno, abierta, concreta y adaptativa. Usá el contexto real de cartera y Planner cuando aporte valor. Explorá gradualmente: objetivos, relación con volatilidad/drawdowns, concentración y convicción, qué invalida una tesis, liquidez, DCA vs oportunidades, ventas, errores pasados y qué espera que el Twin cuestione.

No presupongas que diversificación o menor riesgo son siempre mejores. Separá preferencias declaradas de conducta observada. No cambies el perfil silenciosamente.

Después de suficiente información (normalmente 4 a 6 respuestas sustantivas), devolvé una propuesta de perfil para confirmar.

Respondé SIEMPRE JSON válido, sin markdown, con este formato:
{
  "phase": "question" | "proposal",
  "message": "texto breve en español rioplatense",
  "question": "pregunta si phase=question, sino vacío",
  "proposal": null | {
    "investor_narrative": "narrativa rica en primera persona, 120-220 palabras",
    "style": "Crecimiento|Balanceado|Preservación|",
    "concentration_tolerance": "Baja|Media|Alta|Alta con convicción|",
    "drawdown_tolerance": "Baja|Media|Alta|",
    "liquidity_preference": "Baja|Media|Alta|Oportunista|",
    "implementation_style": "DCA|Híbrida · DCA + oportunista|Entradas oportunistas|Concentrado por tesis|",
    "convictions": ["..."],
    "rules": ["..."],
    "notes": "matices relevantes"
  }
}`;
}

async function runGuidedInterview({ messages = [], context = {}, currentProfile = null }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.code = "OPENAI_NOT_CONFIGURED";
    throw error;
  }

  const transcript = messages.map((m) => `${m.role === "assistant" ? "Twin" : "Usuario"}: ${m.content}`).join("\n");
  const input = `CONTEXTO DETERMINÍSTICO ACTUAL:\n${JSON.stringify(context, null, 2)}\n\nPERFIL ACTUAL (puede estar vacío):\n${JSON.stringify(currentProfile || {}, null, 2)}\n\nCONVERSACIÓN HASTA AHORA:\n${transcript || "(sin conversación; iniciá con la primera pregunta)"}`;

  const { data } = await axios.post(OPENAI_RESPONSES_URL, {
    model: DEFAULT_MODEL,
    instructions: buildInstructions(),
    input,
    max_output_tokens: 900,
    text: { verbosity: "low" },
    store: false,
  }, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    timeout: 45000,
  });

  const result = parseJson(extractOutputText(data));
  return {
    ...result,
    usage: data?.usage || null,
    model: data?.model || DEFAULT_MODEL,
    responseId: data?.id || null,
  };
}

module.exports = { runGuidedInterview };
