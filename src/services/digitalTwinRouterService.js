const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const EXTERNAL = /\b(hoy|ahora|actual|mercado|cotizaci[oó]n|precio|noticia|t[eé]cnico|fundamental|valuaci[oó]n)\b/i;
const TRADING = /\b(trading|trade|trades|longs?|shorts?|fees?|apalancamiento)\b/i;
const FACTUAL = /\b(cu[aá]nto|cu[aá]ntos|tengo|tenencia|posici[oó]n|saldo|total|pnl|gan[eé]|perd[ií]|resultado|liquidez|peso|porcentaje|fees?)\b/i;
const ANALYTICAL = /\b(conviene|deber[ií]a|parece|demasiado|riesgo|mejorar|patr[oó]n|por qu[eé]|recomend|analiz)\b/i;

function latestQuestion(messages = []) {
  return String([...messages].reverse().find((message) => message?.role === "user")?.content || "").trim();
}

function classifyTwinRoute(messages = []) {
  const question = latestQuestion(messages);
  if (EXTERNAL.test(question)) return { route: "EXTERNAL_ANALYSIS", question, reason: "current_market_context" };
  if (TRADING.test(question) && FACTUAL.test(question) && !ANALYTICAL.test(question)) return { route: "TRADING_DATA", question, reason: "factual_trading_query" };
  if (FACTUAL.test(question) && !ANALYTICAL.test(question)) return { route: "INTERNAL_DATA", question, reason: "factual_portfolio_query" };
  return { route: "TWIN_ANALYSIS", question, reason: "reasoning_required" };
}

function usd(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function number(value, digits = 6) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(Number(value) || 0);
}

function percent(value) {
  return `${number(value, 2)}%`;
}

function findHolding(question, portfolio = {}) {
  const holdings = Array.isArray(portfolio.holdings) ? portfolio.holdings : [];
  return holdings.find((holding) => {
    const ticker = String(holding.ticker || "").toUpperCase();
    return ticker && new RegExp(`\\b${ticker.replace(/[^A-Z0-9]/g, "")}\\b`, "i").test(question);
  });
}

function answerPortfolioQuestion(question, context = {}) {
  const portfolio = context.portfolio || context || {};
  const ownershipQuestion=/\b(titular|titulares|nombre de|horacio|valeria|vale|owner)\b/i.test(question);
  const ownershipQualifier=/\b(crypto|cripto|acci[oó]n|cedear|etf|cash|usdt|btc|eth|sol|broker|plataforma|trading|compra|venta|aporte|durante|desde|hasta|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|20\d{2})\b/i.test(question);
  if (ownershipQuestion && ownershipQualifier) return null;
  if (ownershipQuestion && !ownershipQualifier && Array.isArray(portfolio.ownership)) {
    const requestedOwners = portfolio.ownership.filter((item) => new RegExp(`\\b${String(item.owner).replace(/[^a-záéíóúüñ0-9]/gi, "")}\\b`, "i").test(question));
    const rows = requestedOwners.length === 1 ? requestedOwners : portfolio.ownership;
    if (rows.length) return rows.map((item) => `${item.owner}: ${usd(item.valueUsd)} en ${number(item.assetCount, 0)} activos (${percent(item.weightPct)})`).join(" · ") + ".";
  }
  const holding = findHolding(question, portfolio);
  if (holding) {
    const parts = [`Tenés ${number(holding.quantity)} ${holding.ticker}`];
    if (holding.valueUsd != null) parts.push(`con un valor actual de ${usd(holding.valueUsd)}`);
    if (holding.weightPct != null) parts.push(`y representa ${percent(holding.weightPct)} de la cartera`);
    return `${parts.join(" ")}.`;
  }
  if (/\b(usdt)\b/i.test(question)) return `Tenés ${usd(portfolio.usdt)} en USDT.`;
  if (/\b(liquidez|cash|efectivo|disponible)\b/i.test(question)) return `Tu liquidez registrada es ${usd(portfolio.investableLiquidity)}, equivalente al ${percent(portfolio.liquidityWeight)} de la cartera.`;
  if (/\b(crypto|criptomonedas?)\b/i.test(question)) return `Tu exposición a crypto es ${usd(portfolio.crypto)}, equivalente al ${percent(portfolio.cryptoWeight)} de la cartera.`;
  if (/\b(total|cartera|portfolio)\b/i.test(question)) return `El valor total registrado de tu portfolio es ${usd(portfolio.portfolioTotal)}.`;
  return null;
}

async function answerTradingQuestion(question) {
  const [summaryRows, assetRows] = await Promise.all([
    runQuery(`SELECT * FROM ${table("vw_trading_summary")} LIMIT 1`),
    runQuery(`SELECT * FROM ${table("vw_trading_by_asset")} ORDER BY pnl_usd DESC`),
  ]);
  const summary = summaryRows[0] || {};
  const totalPnl = Number(summary.total_pnl_usd ?? summary.pnl_usd ?? 0);
  if (/\b(asset|activo|instrumento|btc|eth|sol|ada)\b/i.test(question) && assetRows.length) {
    const requested = question.match(/\b(BTC|ETH|SOL|ADA)\b/i)?.[1]?.toUpperCase();
    const rows = requested ? assetRows.filter((row) => String(row.instrument || row.asset || "").toUpperCase() === requested) : assetRows;
    if (requested && rows[0]) return `En ${requested}, tu resultado realizado de trading es ${usd(rows[0].pnl_usd ?? rows[0].total_pnl_usd)} en ${number(rows[0].total_trades ?? rows[0].trades, 0)} trades.`;
    const best = rows[0];
    return `Tu activo con mayor PnL registrado es ${best.instrument || best.asset}: ${usd(best.pnl_usd ?? best.total_pnl_usd)}.`;
  }
  if (/\b(fee|fees|comisiones?)\b/i.test(question)) return `Tus fees registrados de trading suman ${usd(summary.total_fees_usd ?? summary.fees_usd)}.`;
  return `Tu resultado realizado de trading es ${usd(totalPnl)} en total, sobre ${number(summary.total_trades, 0)} trades.`;
}

async function resolveRoutedQuestion(route, context = {}) {
  if (route.route === "INTERNAL_DATA") {
    const answer = answerPortfolioQuestion(route.question, context);
    return answer ? { answer, route: route.route, dataSources: ["portfolio_context"] } : null;
  }
  if (route.route === "TRADING_DATA") {
    const answer = await answerTradingQuestion(route.question);
    return { answer, route: route.route, dataSources: ["vw_trading_summary", "vw_trading_by_asset"] };
  }
  return null;
}

module.exports = { answerPortfolioQuestion, classifyTwinRoute, resolveRoutedQuestion };
