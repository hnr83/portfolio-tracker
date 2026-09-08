const { decisionChat: baseDecisionChat, getInvestorProfile } = require("./digitalTwinController");
const { auditAndReviseDecision } = require("../services/digitalTwinEpistemicAudit");

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

async function auditedDecisionChat(req, res) {
  try {
    const baseCapture = captureResponse();
    await baseDecisionChat(req, baseCapture.res);
    const base = baseCapture.result();
    if (base.statusCode >= 400) return res.status(base.statusCode).json(base.payload);

    const result = base.payload || {};
    if (!result.answer || !result.evidenceMatrix) return res.json(result);

    const profileCapture = captureResponse();
    await getInvestorProfile(req, profileCapture.res);
    const profileResult = profileCapture.result();
    if (profileResult.statusCode >= 400) return res.status(profileResult.statusCode).json(profileResult.payload);

    const audited = await auditAndReviseDecision({
      draft: result.answer,
      evidenceMatrix: result.evidenceMatrix,
      currentProfile: profileResult.payload || {},
      context: req.body?.context || {},
      plan: result.preflight || {}
    });

    const baseUsage = result.usage || {};
    const auditUsage = audited.usage || {};
    const mergedUsage = {
      input_tokens: (Number(baseUsage.input_tokens) || 0) + (Number(auditUsage.input_tokens) || 0),
      output_tokens: (Number(baseUsage.output_tokens) || 0) + (Number(auditUsage.output_tokens) || 0),
      total_tokens: (Number(baseUsage.total_tokens) || 0) + (Number(auditUsage.total_tokens) || 0),
      input_tokens_details: { cached_tokens: (Number(baseUsage.input_tokens_details?.cached_tokens) || 0) + (Number(auditUsage.input_tokens_details?.cached_tokens) || 0) },
      output_tokens_details: { reasoning_tokens: (Number(baseUsage.output_tokens_details?.reasoning_tokens) || 0) + (Number(auditUsage.output_tokens_details?.reasoning_tokens) || 0) }
    };

    return res.json({
      ...result,
      answer: audited.answer,
      epistemicAudit: audited.audit,
      usage: mergedUsage,
      apiRequests: (Number(result.apiRequests) || 0) + (Number(audited.apiRequests) || 0),
      responseId: audited.responseId || result.responseId
    });
  } catch (error) {
    console.error("Digital Twin epistemic audit failed:", {
      message: error?.message,
      code: error?.code,
      status: error?.response?.status,
      response: error?.response?.data
    });
    return res.status(500).json({ error: "Error auditing Digital Twin decision" });
  }
}

module.exports = { auditedDecisionChat };
