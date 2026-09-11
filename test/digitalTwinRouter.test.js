const test = require("node:test");
const assert = require("node:assert/strict");

process.env.BIGQUERY_PROJECT_ID ||= "test-project";
process.env.BIGQUERY_DATASET_ID ||= "test-dataset";

const { answerPortfolioQuestion, classifyTwinRoute } = require("../src/services/digitalTwinRouterService");

const messages = (content) => [{ role: "user", content }];

test("routes factual portfolio questions without an LLM", () => {
  assert.equal(classifyTwinRoute(messages("¿Cuánto BTC tengo?")).route, "INTERNAL_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuál es mi liquidez?")).route, "INTERNAL_DATA");
});

test("routes factual trading questions to trading data", () => {
  assert.equal(classifyTwinRoute(messages("¿Cuánto gané haciendo trading?")).route, "TRADING_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuánto pagué de fees?")).route, "TRADING_DATA");
});

test("keeps judgment and current-market questions in an LLM pipeline", () => {
  assert.equal(classifyTwinRoute(messages("¿Estoy demasiado expuesto a BTC?")).route, "TWIN_ANALYSIS");
  assert.equal(classifyTwinRoute(messages("¿Conviene comprar BTC con el precio de hoy?")).route, "EXTERNAL_ANALYSIS");
  assert.equal(classifyTwinRoute(messages("¿Qué patrón ves en mis trades perdedores?")).route, "TWIN_ANALYSIS");
});

test("answers a holding question from deterministic context", () => {
  const answer = answerPortfolioQuestion("¿Cuánto BTC tengo?", {
    portfolioTotal: 200000,
    holdings: [{ ticker: "BTC", quantity: 0.81, valueUsd: 64000, weightPct: 32 }],
  });
  assert.match(answer, /0,81 BTC/);
  assert.match(answer, /US\$\s?64\.000/);
  assert.match(answer, /32%/);
});
