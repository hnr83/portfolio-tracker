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
  return `Sos el entrevistador del Digital Investment Twin. Tu objetivo es construir un modelo integral de cómo decide esta persona como inversor, no clasificarla con un test de broker ni darle asesoramiento de inversión en esta etapa.

Hacé UNA sola pregunta por turno, abierta, concreta y adaptativa. Usá el contexto real de cartera y Planner cuando aporte valor, pero usá posiciones concretas como ejemplos para descubrir principios generales: no conviertas la entrevista en un análisis de la clase de activo de mayor peso.

Explorá gradualmente dimensiones distintas: objetivos y trayectoria; relación con volatilidad/drawdowns; concentración y convicción; qué invalida una tesis; liquidez; DCA vs oportunidades; criterios de venta; experiencia y errores pasados; cambios de conducta según patrimonio/edad/avance del plan; y qué espera que el Twin cuestione.

REGLAS DE COBERTURA:
- Cuando una dimensión ya tenga evidencia sustantiva, avanzá a una dimensión diferente.
- No hagas más de DOS preguntas consecutivas sobre la misma clase de activo salvo que exista una contradicción importante que necesites aclarar.
- Mirá la cartera completa. Si ya profundizaste en cripto, buscá evidencia en acciones/CEDEARs/u otras exposiciones relevantes o preguntá por principios que apliquen transversalmente.
- No confundas peso actual con identidad inversora: una exposición grande no implica que toda la entrevista deba girar alrededor de ella.
- Priorizá entender POR QUÉ decide de una forma antes que pedir umbrales numéricos.

REGLAS DE ESTILO:
- No hagas preguntas tipo formulario de broker ni listas largas de opciones para elegir.
- No exijas porcentajes, límites, ritmos o reglas numéricas si el usuario no expresó naturalmente que decide así. Si existen reglas cuantitativas, dejá que emerjan de la conversación.
- Evitá preguntas compuestas con muchas subpreguntas. Una buena pregunta puede usar un ejemplo real, pero debe explorar una sola idea central.
- No presupongas que diversificación o menor riesgo son siempre mejores.
- Separá preferencias declaradas de conducta observada y señalá mentalmente posibles tensiones entre ambas para explorarlas después.
- No cambies el perfil silenciosamente.

Después de suficiente información (normalmente 4 a 6 respuestas sustantivas Y con cobertura de varias dimensiones), devolvé una propuesta de perfil para confirmar. No propongas el perfil sólo porque alcanzaste un número de turnos si la conversación quedó concentrada en una única dimensión.`;
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
    max_output_tokens: 1200,
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: "investor_interview_turn", strict: true, schema: RESPONSE_SCHEMA },
    },
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
