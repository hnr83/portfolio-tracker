const crypto = require("crypto");
const { getInvestorProfile } = require("./digitalTwinController");
const { runDecisionPipeline } = require("../services/digitalTwinDecisionPipeline");
const { runSolDecisionExperiment } = require("../services/digitalTwinSolDecisionExperiment");
const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");

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

function mergeUsage(baseUsage = {}, extraUsage = {}) {
  return {
    input_tokens: (Number(baseUsage.input_tokens) || 0) + (Number(extraUsage.input_tokens) || 0),
    output_tokens: (Number(baseUsage.output_tokens) || 0) + (Number(extraUsage.output_tokens) || 0),
    total_tokens: (Number(baseUsage.total_tokens) || 0) + (Number(extraUsage.total_tokens) || 0),
    input_tokens_details: {
      cached_tokens: (Number(baseUsage.input_tokens_details?.cached_tokens) || 0) + (Number(extraUsage.input_tokens_details?.cached_tokens) || 0)
    },
    output_tokens_details: {
      reasoning_tokens: (Number(baseUsage.output_tokens_details?.reasoning_tokens) || 0) + (Number(extraUsage.output_tokens_details?.reasoning_tokens) || 0)
    }
  };
}

async function trackUsage(result, messageCount) {
  try {
    const usage = result?.usage || {};
    await runQuery(
      `INSERT INTO ${table("digital_twin_usage")} (id,operation_type,source,model,api_requests,input_tokens,output_tokens,total_tokens,cached_tokens,reasoning_tokens,web_search_calls,response_id,metadata_json,created_at)
       VALUES(@id,'decision','digital_twin',@model,@apiRequests,@inputTokens,@outputTokens,@totalTokens,@cachedTokens,@reasoningTokens,@webSearchCalls,@responseId,@metadataJson,CURRENT_TIMESTAMP())`,
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
        responseId: String(result?.responseId || ""),
        metadataJson: JSON.stringify({
          message_count: messageCount,
          pipeline: result?.experiment?.name || "bounded_research_v3",
          experiment: result?.experiment || null
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
    const context = req.body?.context && typeof req.body.context === "object" ? req.body.context : {};
    if (!messages.length) return res.status(400).json({ error: "A decision question is required" });

    const profileCapture = captureResponse();
    await getInvestorProfile(req, profileCapture.res);
    const profileResult = profileCapture.result();
    if (profileResult.statusCode >= 400) return res.status(profileResult.statusCode).json(profileResult.payload);
    const profile = profileResult.payload || {};
    if (!profile.investor_narrative) return res.status(409).json({ error: "Build and confirm the Investor Model before using the Twin chat" });

    // Keep the existing cheap preflight + research pipeline unchanged so the experiment
    // sees the same evidence architecture. Its mini draft is intentionally discarded.
    const result = await runDecisionPipeline({ messages, context, currentProfile: profile });
    if (!result.answer || !result.evidenceMatrix) {
      await trackUsage(result, messages.length);
      return res.json(result);
    }

    // Controlled A/B: one Sol decision over the exact preflight/evidence already produced.
    // No epistemic audit/rewrite afterwards, otherwise we would contaminate the comparison.
    const sol = await runSolDecisionExperiment({
      messages,
      context,
      currentProfile: profile,
      preflight: result.preflight || {},
      evidenceMatrix: result.evidenceMatrix
    });

    const finalResult = {
      ...result,
      answer: sol.answer,
      usage: mergeUsage(result.usage, sol.usage),
      apiRequests: (Number(result.apiRequests) || 0) + 1,
      model: sol.model,
      responseId: sol.responseId || result.responseId,
      epistemicAudit: {
        skipped: true,
        reason: "controlled_sol_ab_experiment",
        message: "Auditoría/revisión omitida deliberadamente para medir la decisión de Sol sin contaminación posterior."
      },
      experiment: {
        name: "sol_decision_ab_v1",
        decisionModel: sol.model,
        baselinePipelineModel: result.model,
        auditSkipped: true
      }
    };

    await trackUsage(finalResult, messages.length);
    return res.json(finalResult);
  } catch (error) {
    console.error("Digital Twin decision experiment failed:", {
      message: error?.message,
      code: error?.code,
      status: error?.response?.status
    });
    if (error?.code === "OPENAI_NOT_CONFIGURED") return res.status(503).json({ error: "Digital Twin LLM is not configured", code: error.code });
    return res.status(500).json({ error: "Error running Digital Twin decision experiment" });
  }
}

module.exports = { auditedDecisionChat };
