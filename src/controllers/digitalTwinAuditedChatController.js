const crypto = require("crypto");
const { getInvestorProfile } = require("./digitalTwinController");
const { runDecisionPipeline } = require("../services/digitalTwinDecisionPipeline");
const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");
const {
  applyPolicyUpdatesFromMessages,
  loadCurrentInvestmentPolicy
} = require("../services/digitalTwinInvestmentPolicy");

const PRICING = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.00 },
  "gpt-5.6-sol": { input: 4.00, cachedInput: 0.40, output: 20.00 }
};
const WEB_SEARCH_COST_USD = 0.01;
const COST_SOURCE = "estimated_openai_standard_pricing_2026-09-08";

function captureResponse() {
  let statusCode = 200;
  let payload;
  return {
    res: {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return value; }
    },
    result() { return { statusCode, payload }; }
  };
}

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages.slice(-30).map(item => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: String(item?.content || "").slice(0, 4000)
      })).filter(item => item.content.trim())
    : [];
}

function pricingForModel(model = "") {
  const value = String(model).toLowerCase();
  if (value.startsWith("gpt-5.6-sol") || value === "gpt-5.6") return PRICING["gpt-5.6-sol"];
  if (value.startsWith("gpt-5-mini")) return PRICING["gpt-5-mini"];
  return null;
}

function estimateStageCost(stage = {}) {
  const rates = pricingForModel(stage.model);
  if (!rates) return null;
  const usage = stage.usage || {};
  const input = Number(usage.input_tokens) || 0;
  const cached = Math.min(input, Number(usage.input_tokens_details?.cached_tokens) || 0);
  const uncached = Math.max(0, input - cached);
  const output = Number(usage.output_tokens) || 0;
  const webSearchCalls = Number(stage.webSearchCalls) || 0;
  return (uncached / 1_000_000 * rates.input)
    + (cached / 1_000_000 * rates.cachedInput)
    + (output / 1_000_000 * rates.output)
    + (webSearchCalls * WEB_SEARCH_COST_USD);
}

function usageBreakdown(stages = []) {
  const enriched = (stages || []).map(stage => ({
    stage: stage.stage,
    model: stage.model,
    api_requests: Number(stage.apiRequests) || 0,
    input_tokens: Number(stage.usage?.input_tokens) || 0,
    cached_tokens: Number(stage.usage?.input_tokens_details?.cached_tokens) || 0,
    output_tokens: Number(stage.usage?.output_tokens) || 0,
    reasoning_tokens: Number(stage.usage?.output_tokens_details?.reasoning_tokens) || 0,
    total_tokens: Number(stage.usage?.total_tokens) || 0,
    web_search_calls: Number(stage.webSearchCalls) || 0,
    estimated_cost_usd: estimateStageCost(stage)
  }));
  const knownCosts = enriched.map(x => x.estimated_cost_usd).filter(Number.isFinite);
  return {
    stages: enriched,
    estimatedTotalCostUsd: knownCosts.length === enriched.length ? knownCosts.reduce((a,b)=>a+b,0) : null
  };
}

async function trackUsage(result, messageCount) {
  try {
    const usage = result?.usage || {};
    const breakdown = usageBreakdown(result?.usageStages || []);
    await runQuery(
      `INSERT INTO ${table("digital_twin_usage")} (id,operation_type,source,model,api_requests,input_tokens,output_tokens,total_tokens,cached_tokens,reasoning_tokens,web_search_calls,cost_usd,cost_source,response_id,metadata_json,created_at)
       VALUES(@id,'decision','digital_twin',@model,@apiRequests,@inputTokens,@outputTokens,@totalTokens,@cachedTokens,@reasoningTokens,@webSearchCalls,@costUsd,@costSource,@responseId,@metadataJson,CURRENT_TIMESTAMP())`,
      {
        id: crypto.randomUUID(),
        model: String(result?.model || ""),
        apiRequests: Number(result?.apiRequests) || 0,
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
        totalTokens: Number(usage.total_tokens) || 0,
        cachedTokens: Number(usage.input_tokens_details?.cached_tokens) || 0,
        reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens) || 0,
        webSearchCalls: Number(result?.tools?.webSearchCalls) || 0,
        costUsd: breakdown.estimatedTotalCostUsd,
        costSource: breakdown.estimatedTotalCostUsd == null ? null : COST_SOURCE,
        responseId: String(result?.responseId || ""),
        metadataJson: JSON.stringify({
          message_count: messageCount,
          pipeline: result?.pipeline || "hybrid_sol_v1",
          usage_stages: breakdown.stages
        })
      }
    );
  } catch (error) {
    console.error("Error tracking Digital Twin usage (non-blocking):", {
      message: error?.message,
      code: error?.code
    });
  }
}

async function auditedDecisionChat(req, res) {
  try {
    const messages = normalizeMessages(req.body?.messages);
    const requestContext = req.body?.context && typeof req.body.context === "object" ? req.body.context : {};
    if (!messages.length) return res.status(400).json({ error: "A decision question is required" });

    const profileCapture = captureResponse();
    await getInvestorProfile(req, profileCapture.res);
    const profileResult = profileCapture.result();
    if (profileResult.statusCode >= 400) return res.status(profileResult.statusCode).json(profileResult.payload);
    const profile = profileResult.payload || {};
    if (!profile.investor_narrative) return res.status(409).json({ error: "Build and confirm the Investor Model before using the Twin chat" });

    const policyUpdates = await applyPolicyUpdatesFromMessages(messages);
    const currentInvestmentPolicy = await loadCurrentInvestmentPolicy();
    const context = {
      ...requestContext,
      currentInvestmentPolicy: {
        semantics: "current_operational_state_not_investor_preference_or_future_rule",
        policies: currentInvestmentPolicy
      }
    };
    // The current pipeline compacts decision context aggressively. Carry operational state
    // alongside the profile only as transport; Sol separates it before reasoning.
    const decisionProfile = {
      ...profile,
      current_operational_state: context.currentInvestmentPolicy
    };

    const result = await runDecisionPipeline({ messages, context, currentProfile: decisionProfile });
    await trackUsage(result, messages.length);
    return res.json({
      ...result,
      currentInvestmentPolicy,
      investmentPolicyUpdates: policyUpdates
    });
  } catch (error) {
    console.error("Digital Twin decision failed:", {
      message: error?.message,
      code: error?.code,
      status: error?.response?.status
    });
    if (error?.code === "OPENAI_NOT_CONFIGURED") return res.status(503).json({ error: "Digital Twin LLM is not configured", code: error.code });
    return res.status(500).json({ error: "Error running Digital Twin decision" });
  }
}

module.exports = { auditedDecisionChat };
