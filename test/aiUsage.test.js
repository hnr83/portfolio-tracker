const test = require("node:test");
const assert = require("node:assert/strict");

process.env.BIGQUERY_PROJECT_ID ||= "test-project";
process.env.BIGQUERY_DATASET_ID ||= "test-dataset";

const { estimateUsageCost, pricingForModel, usageBreakdown } = require("../src/services/aiPricingService");
const { normalizePeriod, normalizeScope } = require("../src/controllers/aiUsageController");

test("estimates uncached, cached, output and web search cost", () => {
  const cost = estimateUsageCost({
    model: "gpt-5-mini-2026-01-01",
    usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 } },
    webSearchCalls: 1,
  });
  assert.equal(cost, 0.01056);
});

test("does not invent a cost for unknown models", () => {
  assert.equal(pricingForModel("unknown-model"), null);
  assert.equal(estimateUsageCost({ model: "unknown-model", usage: { input_tokens: 1000 } }), null);
});

test("only returns a pipeline total when every stage can be priced", () => {
  const complete = usageBreakdown([{ stage: "decision", model: "gpt-5.6-sol", usage: { input_tokens: 1000, output_tokens: 100 } }]);
  assert.equal(complete.estimatedTotalCostUsd, 0.006);
  const partial = usageBreakdown([
    { stage: "decision", model: "gpt-5.6-sol", usage: { input_tokens: 1000, output_tokens: 100 } },
    { stage: "other", model: "unknown-model", usage: { input_tokens: 100 } },
  ]);
  assert.equal(partial.estimatedTotalCostUsd, null);
});

test("validates month and rolling-range scopes", () => {
  assert.equal(normalizePeriod("2026-09"), "2026-09");
  assert.equal(normalizePeriod("2026-13"), null);
  assert.deepEqual(normalizeScope({ range: "7d" }), { type: "range", value: "7d", days: 7 });
  assert.equal(normalizeScope({ range: "90d" }), null);
});
