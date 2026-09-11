const PRICING = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
};

const WEB_SEARCH_COST_USD = 0.01;
const COST_SOURCE = "estimated_openai_standard_pricing_2026-09-08";

function pricingForModel(model = "") {
  const value = String(model).toLowerCase();
  if (value.startsWith("gpt-5.6-sol") || value === "gpt-5.6") return PRICING["gpt-5.6-sol"];
  if (value.startsWith("gpt-5-mini")) return PRICING["gpt-5-mini"];
  return null;
}

function estimateUsageCost({ model, usage = {}, webSearchCalls = 0 } = {}) {
  const pricing = pricingForModel(model);
  if (!pricing) return null;
  const input = Number(usage.input_tokens) || 0;
  const cached = Math.min(input, Number(usage.input_tokens_details?.cached_tokens) || 0);
  const output = Number(usage.output_tokens) || 0;
  return Math.max(0, input - cached) / 1e6 * pricing.input
    + cached / 1e6 * pricing.cachedInput
    + output / 1e6 * pricing.output
    + (Number(webSearchCalls) || 0) * WEB_SEARCH_COST_USD;
}

function estimateStageCost(stage = {}) {
  return estimateUsageCost({ model: stage.model, usage: stage.usage, webSearchCalls: stage.webSearchCalls });
}

function usageBreakdown(stages = []) {
  const enriched = stages.filter(Boolean).map((stage) => ({
    stage: stage.stage,
    model: stage.model,
    api_requests: Number(stage.apiRequests) || 0,
    input_tokens: Number(stage.usage?.input_tokens) || 0,
    cached_tokens: Number(stage.usage?.input_tokens_details?.cached_tokens) || 0,
    output_tokens: Number(stage.usage?.output_tokens) || 0,
    reasoning_tokens: Number(stage.usage?.output_tokens_details?.reasoning_tokens) || 0,
    total_tokens: Number(stage.usage?.total_tokens) || 0,
    web_search_calls: Number(stage.webSearchCalls) || 0,
    estimated_cost_usd: estimateStageCost(stage),
  }));
  const costs = enriched.map((item) => item.estimated_cost_usd).filter(Number.isFinite);
  return {
    stages: enriched,
    estimatedTotalCostUsd: costs.length === enriched.length ? costs.reduce((sum, value) => sum + value, 0) : null,
  };
}

module.exports = { COST_SOURCE, WEB_SEARCH_COST_USD, estimateUsageCost, estimateStageCost, pricingForModel, usageBreakdown };
