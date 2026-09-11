const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TIME_ZONE = "America/Argentina/Buenos_Aires";

function currentPeriod() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function normalizePeriod(value) {
  const period = String(value || currentPeriod());
  return PERIOD_PATTERN.test(period) ? period : null;
}

function number(value) {
  return Number(value) || 0;
}

function dateValue(value) {
  return value?.value || value || null;
}

async function getAiUsage(req, res) {
  const period = normalizePeriod(req.query.period);
  if (!period) return res.status(400).json({ error: "El período debe tener formato YYYY-MM" });

  try {
    const usageTable = table("digital_twin_usage");
    const commonWhere = `FORMAT_DATE('%Y-%m', DATE(created_at, '${TIME_ZONE}')) = @period`;
    const [summaryRows, modelRows, operationRows, dailyRows, recentRows] = await Promise.all([
      runQuery(`
        SELECT
          COUNT(*) AS conversations,
          SUM(COALESCE(api_requests, 0)) AS api_requests,
          SUM(COALESCE(input_tokens, 0)) AS input_tokens,
          SUM(COALESCE(cached_tokens, 0)) AS cached_tokens,
          SUM(COALESCE(output_tokens, 0)) AS output_tokens,
          SUM(COALESCE(reasoning_tokens, 0)) AS reasoning_tokens,
          SUM(COALESCE(total_tokens, 0)) AS total_tokens,
          SUM(COALESCE(web_search_calls, 0)) AS web_search_calls,
          SUM(COALESCE(cost_usd, 0)) AS cost_usd,
          COUNTIF(cost_usd IS NULL) AS unpriced_conversations,
          COUNTIF(COALESCE(api_requests, 0) = 0) AS internal_only_conversations
        FROM ${usageTable}
        WHERE ${commonWhere}
      `, { period }),
      runQuery(`
        SELECT
          COALESCE(NULLIF(model, ''), 'Sin identificar') AS model,
          COUNT(*) AS conversations,
          SUM(COALESCE(total_tokens, 0)) AS total_tokens,
          SUM(COALESCE(cost_usd, 0)) AS cost_usd
        FROM ${usageTable}
        WHERE ${commonWhere}
        GROUP BY model
        ORDER BY cost_usd DESC, total_tokens DESC
      `, { period }),
      runQuery(`
        SELECT
          COALESCE(NULLIF(operation_type, ''), 'other') AS operation_type,
          COUNT(*) AS conversations,
          SUM(COALESCE(api_requests, 0)) AS api_requests,
          SUM(COALESCE(total_tokens, 0)) AS total_tokens,
          SUM(COALESCE(cost_usd, 0)) AS cost_usd
        FROM ${usageTable}
        WHERE ${commonWhere}
        GROUP BY operation_type
        ORDER BY cost_usd DESC, total_tokens DESC
      `, { period }),
      runQuery(`
        SELECT
          FORMAT_DATE('%Y-%m-%d', DATE(created_at, '${TIME_ZONE}')) AS date,
          COUNT(*) AS conversations,
          SUM(COALESCE(total_tokens, 0)) AS total_tokens,
          SUM(COALESCE(cost_usd, 0)) AS cost_usd
        FROM ${usageTable}
        WHERE ${commonWhere}
        GROUP BY date
        ORDER BY date
      `, { period }),
      runQuery(`
        SELECT id, operation_type, model, api_requests, input_tokens, cached_tokens,
          output_tokens, total_tokens, web_search_calls, cost_usd, cost_source, created_at
        FROM ${usageTable}
        WHERE ${commonWhere}
        ORDER BY created_at DESC
        LIMIT 20
      `, { period }),
    ]);

    const raw = summaryRows[0] || {};
    const conversations = number(raw.conversations);
    const costUsd = number(raw.cost_usd);

    return res.json({
      period,
      timezone: TIME_ZONE,
      summary: {
        conversations,
        apiRequests: number(raw.api_requests),
        inputTokens: number(raw.input_tokens),
        cachedTokens: number(raw.cached_tokens),
        outputTokens: number(raw.output_tokens),
        reasoningTokens: number(raw.reasoning_tokens),
        totalTokens: number(raw.total_tokens),
        webSearchCalls: number(raw.web_search_calls),
        costUsd,
        averageCostUsd: conversations ? costUsd / conversations : 0,
        unpricedConversations: number(raw.unpriced_conversations),
        internalOnlyConversations: number(raw.internal_only_conversations),
        internalResolutionRate: conversations ? number(raw.internal_only_conversations) / conversations : null,
      },
      byModel: modelRows.map((row) => ({
        model: row.model,
        conversations: number(row.conversations),
        totalTokens: number(row.total_tokens),
        costUsd: number(row.cost_usd),
      })),
      byOperation: operationRows.map((row) => ({
        operationType: row.operation_type,
        conversations: number(row.conversations),
        apiRequests: number(row.api_requests),
        totalTokens: number(row.total_tokens),
        costUsd: number(row.cost_usd),
      })),
      daily: dailyRows.map((row) => ({
        date: row.date,
        conversations: number(row.conversations),
        totalTokens: number(row.total_tokens),
        costUsd: number(row.cost_usd),
      })),
      recent: recentRows.map((row) => ({
        id: row.id,
        operationType: row.operation_type,
        model: row.model || "Sin identificar",
        apiRequests: number(row.api_requests),
        inputTokens: number(row.input_tokens),
        cachedTokens: number(row.cached_tokens),
        outputTokens: number(row.output_tokens),
        totalTokens: number(row.total_tokens),
        webSearchCalls: number(row.web_search_calls),
        costUsd: row.cost_usd == null ? null : number(row.cost_usd),
        costSource: row.cost_source || null,
        createdAt: dateValue(row.created_at),
      })),
    });
  } catch (error) {
    console.error("Error loading AI usage:", { message: error?.message, code: error?.code });
    return res.status(500).json({ error: "Error loading AI usage" });
  }
}

module.exports = { getAiUsage, normalizePeriod };
