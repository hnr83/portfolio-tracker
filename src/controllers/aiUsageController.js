const { runQuery } = require("../services/bigQueryService");
const { estimateUsageCost } = require("../services/aiPricingService");
const { table } = require("../utils/bigqueryHelper");

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RANGE_DAYS = { "7d": 7, "14d": 14, "30d": 30 };
const TIME_ZONE = "America/Argentina/Buenos_Aires";

function currentPeriod() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" }).format(new Date());
}

function normalizeScope(query = {}) {
  if (query.range) {
    const range = String(query.range).toLowerCase();
    return RANGE_DAYS[range] ? { type: "range", value: range, days: RANGE_DAYS[range] } : null;
  }
  const period = String(query.period || currentPeriod());
  return PERIOD_PATTERN.test(period) ? { type: "month", value: period } : null;
}

function normalizePeriod(value) {
  return normalizeScope({ period: value })?.value || null;
}

function number(value) {
  return Number(value) || 0;
}

function dateValue(value) {
  return value?.value || value || null;
}

function localDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function addAggregate(map, key, row) {
  const current = map.get(key) || { conversations: 0, apiRequests: 0, totalTokens: 0, costUsd: 0 };
  current.conversations += 1;
  current.apiRequests += row.apiRequests;
  current.totalTokens += row.totalTokens;
  current.costUsd += row.effectiveCostUsd || 0;
  map.set(key, current);
}

function normalizeRow(row) {
  const usage = {
    input_tokens: number(row.input_tokens),
    output_tokens: number(row.output_tokens),
    input_tokens_details: { cached_tokens: number(row.cached_tokens) },
  };
  const storedCost = row.cost_usd == null ? null : number(row.cost_usd);
  const backfilledCost = storedCost == null ? estimateUsageCost({ model: row.model, usage, webSearchCalls: row.web_search_calls }) : null;
  const effectiveCostUsd = storedCost ?? backfilledCost;
  const reported = storedCost != null && String(row.cost_source || "").startsWith("reported");
  return {
    id: row.id,
    operationType: row.operation_type || "other",
    model: row.model || "Sin identificar",
    apiRequests: number(row.api_requests),
    inputTokens: number(row.input_tokens),
    cachedTokens: number(row.cached_tokens),
    outputTokens: number(row.output_tokens),
    reasoningTokens: number(row.reasoning_tokens),
    totalTokens: number(row.total_tokens),
    webSearchCalls: number(row.web_search_calls),
    storedCostUsd: storedCost,
    effectiveCostUsd,
    costKind: reported ? "reported" : effectiveCostUsd == null ? "unpriced" : "estimated",
    costSource: row.cost_source || (backfilledCost == null ? null : "estimated_from_usage_current_pricing"),
    createdAt: dateValue(row.created_at),
  };
}

async function getAiUsage(req, res) {
  const scope = normalizeScope(req.query);
  if (!scope) return res.status(400).json({ error: "Usá range=7d|14d|30d o period=YYYY-MM" });

  try {
    const where = scope.type === "range"
      ? `created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${scope.days} DAY)`
      : `FORMAT_DATE('%Y-%m', DATE(created_at, '${TIME_ZONE}')) = @period`;
    const params = scope.type === "month" ? { period: scope.value } : {};
    const rows = await runQuery(`
      SELECT id, operation_type, model, api_requests, input_tokens, cached_tokens,
        output_tokens, reasoning_tokens, total_tokens, web_search_calls, cost_usd,
        cost_source, created_at
      FROM ${table("digital_twin_usage")}
      WHERE ${where}
      ORDER BY created_at DESC
    `, params);
    const items = rows.map(normalizeRow);
    const byModel = new Map();
    const byOperation = new Map();
    const daily = new Map();
    items.forEach((row) => {
      addAggregate(byModel, row.model, row);
      addAggregate(byOperation, row.operationType, row);
      addAggregate(daily, localDate(row.createdAt), row);
    });

    const sum = (key) => items.reduce((total, row) => total + number(row[key]), 0);
    const priced = items.filter((row) => row.effectiveCostUsd != null);
    const costUsd = priced.reduce((total, row) => total + row.effectiveCostUsd, 0);
    const reportedCostUsd = items.filter((row) => row.costKind === "reported").reduce((total, row) => total + row.effectiveCostUsd, 0);
    const estimatedCostUsd = items.filter((row) => row.costKind === "estimated").reduce((total, row) => total + row.effectiveCostUsd, 0);
    const internalOnly = items.filter((row) => row.apiRequests === 0).length;
    const serialize = (map, keyName) => [...map.entries()].map(([key, value]) => ({ [keyName]: key, ...value }));

    return res.json({
      scope: { type: scope.type, value: scope.value },
      timezone: TIME_ZONE,
      summary: {
        conversations: items.length,
        pricedConversations: priced.length,
        apiRequests: sum("apiRequests"),
        inputTokens: sum("inputTokens"),
        cachedTokens: sum("cachedTokens"),
        outputTokens: sum("outputTokens"),
        reasoningTokens: sum("reasoningTokens"),
        totalTokens: sum("totalTokens"),
        webSearchCalls: sum("webSearchCalls"),
        costUsd,
        reportedCostUsd,
        estimatedCostUsd,
        averageCostUsd: priced.length ? costUsd / priced.length : null,
        unpricedConversations: items.length - priced.length,
        internalOnlyConversations: internalOnly,
        internalResolutionRate: items.length ? internalOnly / items.length : null,
      },
      byModel: serialize(byModel, "model").sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens),
      byOperation: serialize(byOperation, "operationType").sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens),
      daily: serialize(daily, "date").sort((a, b) => a.date.localeCompare(b.date)),
      recent: items.slice(0, 20).map(({ storedCostUsd, effectiveCostUsd, ...row }) => ({ ...row, costUsd: effectiveCostUsd, storedCostUsd })),
    });
  } catch (error) {
    console.error("Error loading AI usage:", { message: error?.message, code: error?.code });
    return res.status(500).json({ error: "Error loading AI usage" });
  }
}

module.exports = { getAiUsage, normalizePeriod, normalizeScope };
