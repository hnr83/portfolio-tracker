const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const MAX_SUBSTANTIVE_ANSWERS = 6;

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

function isSubstantiveUserAnswer(message) {
  return message?.role === "user" && String(message.content || "").trim().length >= 80;
}

function countSubstantiveAnswers(messages) {
  return messages.filter(isSubstantiveUserAnswer).length;
}

function buildInstructions(forceProposal = false) {
  return `Sos el entrevistador del Digital Investment Twin. Tu objetivo es construir un modelo integral de cómo decide esta persona como inversor, no clasificarla con un test de broker ni darle asesoramiento de inversión en esta etapa.

${forceProposal ? `CIERRE OBLIGATORIO: ya hay suficiente evidencia. NO hagas otra pregunta. Devolvé phase="proposal", question="" y sintetizá el Investor Model usando toda la conversación. La propuesta es una primera versión editable, no una definición permanente. Distinguí principios generales de ejemplos circunstanciales y NO conviertas ejemplos, porcentajes o escenarios mencionados al pasar en reglas rígidas. Mantené la propuesta compacta: narrativa de 120-180 palabras, 4-7 convicciones, 4-7 reglas y notas breves.` : `Hacé UNA sola pregunta por turno, abierta, concreta y adaptativa. Usá el contexto real de cartera y Planner cuando aporte valor. Usá posiciones concretas como ejemplos para descubrir principios generales.`}

Explorá gradualmente dimensiones distintas: objetivos y trayectoria; relación con volatilidad/drawdowns; concentración y convicción; qué invalida una tesis; liquidez; DCA vs oportunidades; criterios de venta; experiencia y errores pasados; cambios de conducta según patrimonio/edad/avance del plan; y qué espera que el Twin cuestione.

REGLAS DE COBERTURA:
- Cuando una dimensión ya tenga evidencia sustantiva, avanzá a una dimensión diferente.
- No hagas más de DOS preguntas consecutivas sobre la misma clase de activo salvo contradicción importante.
- Mirá la cartera completa; no confundas peso actual con identidad inversora.
- Priorizá entender POR QUÉ decide de una forma antes que pedir umbrales numéricos.
- Los ejemplos del usuario son evidencia para inferir principios, NO una lista exhaustiva de reglas.

SEPARÁ IDENTIDAD DE ESTADO ACTUAL:
- El Investor Model debe describir rasgos relativamente persistentes de cómo decide, no copiar el snapshot actual del portfolio o del Planner como si fueran parte permanente de su identidad.
- Objetivos, horizonte, aportes mensuales, pesos actuales, liquidez actual y nombres de activos pueden mencionarse sólo como contexto actual o ejemplos, nunca como reglas permanentes salvo que el usuario haya dicho explícitamente que lo son.
- No escribas cosas como "ejecuta DCA mensual de US$X" si X proviene del Planner actual. Preferí formulaciones como "invierte sistemáticamente el ahorro periódico disponible".
- No infieras una preferencia estratégica por mantener caja a partir de la liquidez actual. Si el usuario dijo que prefiere invertir el ahorro mensual y no esperar oportunidades en cash, reflejalo explícitamente.
- Las posiciones actuales (por ejemplo BTC, TSLA, GOOGL, MELI) pueden ilustrar tesis de alta convicción, pero el principio debe expresarse de forma general para que siga siendo válido si la cartera cambia.
- Los porcentajes mencionados por el usuario como ejemplos de magnitud (por ejemplo 90% de concentración) NO son thresholds automáticos.
- Si una idea es circunstancial, ponela en notes como "contexto actual" en lugar de convertirla en conviction o rule.

REGLAS DE ESTILO:
- No hagas preguntas tipo formulario de broker ni listas largas de opciones.
- No exijas porcentajes o límites si el usuario no decide naturalmente así.
- No presupongas que diversificación o menor riesgo son siempre mejores.
- Separá preferencias declaradas de conducta observada.
- No cambies el perfil silenciosamente.

REGLA DE DURACIÓN: con menos de ${MAX_SUBSTANTIVE_ANSWERS} respuestas sustantivas podés seguir preguntando si falta una dimensión importante. Al llegar a ${MAX_SUBSTANTIVE_ANSWERS} respuestas sustantivas, la entrevista inicial TERMINA: generá obligatoriamente una propuesta aunque queden dimensiones para explorar. Esas dimensiones se podrán refinar después conversando con el Twin. Nunca prolongues la entrevista inicial más allá de ese punto.`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    phase: { type: "string", enum: ["question", "proposal"] },
    message: { type: "string" },
    question: { type: "string" },
    proposal: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            investor_narrative: { type: "string" },
            style: { type: "string", enum: ["Crecimiento", "Balanceado", "Preservación", ""] },
            concentration_tolerance: { type: "string", enum: ["Baja", "Media", "Alta", "Alta con convicción", ""] },
            drawdown_tolerance: { type: "string", enum: ["Baja", "Media", "Alta", ""] },
            liquidity_preference: { type: "string", enum: ["Baja", "Media", "Alta", "Oportunista", ""] },
            implementation_style: { type: "string", enum: ["DCA", "Híbrida · DCA + oportunista", "Entradas oportunistas", "Concentrado por tesis", ""] },
            convictions: { type: "array", items: { type: "string" } },
            rules: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
          },
          required: ["investor_narrative", "style", "concentration_tolerance", "drawdown_tolerance", "liquidity_preference", "implementation_style", "convictions", "rules", "notes"],
        },
      ],
    },
  },
  required: ["phase", "message", "question", "proposal"],
};

async function requestInterviewTurn({ instructions, input, maxOutputTokens }) {
  const { data } = await axios.post(OPENAI_RESPONSES_URL, {
    model: DEFAULT_MODEL,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: "investor_interview_turn", strict: true, schema: RESPONSE_SCHEMA },
    },
    store: false,
  }, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    timeout: 45000,
  });
  return data;
}

function responseWasTruncated(data) {
  return data?.status === "incomplete" || data?.incomplete_details?.reason === "max_output_tokens";
}

async function runGuidedInterview({ messages = [], context = {}, currentProfile = null }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.code = "OPENAI_NOT_CONFIGURED";
    throw error;
  }

  const substantiveAnswers = countSubstantiveAnswers(messages);
  const forceProposal = substantiveAnswers >= MAX_SUBSTANTIVE_ANSWERS;
  const transcript = messages.map((m) => `${m.role === "assistant" ? "Twin" : "Usuario"}: ${m.content}`).join("\n");
  const input = `CONTEXTO DETERMINÍSTICO ACTUAL:\n${JSON.stringify(context, null, 2)}\n\nPERFIL ACTUAL (puede estar vacío):\n${JSON.stringify(currentProfile || {}, null, 2)}\n\nESTADO DE ENTREVISTA:\nRespuestas sustantivas del usuario: ${substantiveAnswers}/${MAX_SUBSTANTIVE_ANSWERS}\nCierre obligatorio: ${forceProposal ? "SÍ" : "NO"}\n\nCONVERSACIÓN HASTA AHORA:\n${transcript || "(sin conversación; iniciá con la primera pregunta)"}`;
  const instructions = buildInstructions(forceProposal);

  let data = await requestInterviewTurn({ instructions, input, maxOutputTokens: forceProposal ? 2400 : 1200 });
  let outputText = extractOutputText(data);
  let result;

  try {
    if (responseWasTruncated(data)) throw new Error("TRUNCATED_OUTPUT");
    result = parseJson(outputText);
  } catch (error) {
    const looksTruncated = responseWasTruncated(data) || error.message === "TRUNCATED_OUTPUT" || /Unterminated string|Unexpected end of JSON input/i.test(error.message || "");
    if (!looksTruncated) throw error;

    console.warn("Digital Twin LLM output was truncated; retrying with larger token budget");
    data = await requestInterviewTurn({ instructions, input, maxOutputTokens: 4000 });
    outputText = extractOutputText(data);
    if (responseWasTruncated(data)) throw new Error("Digital Twin LLM response remained truncated after retry");
    result = parseJson(outputText);
  }

  if (forceProposal && result.phase !== "proposal") throw new Error("Twin interview exceeded answer cap without producing proposal");

  return {
    ...result,
    usage: data?.usage || null,
    model: data?.model || DEFAULT_MODEL,
    responseId: data?.id || null,
  };
}

module.exports = { runGuidedInterview };
