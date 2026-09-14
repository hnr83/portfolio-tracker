const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const EXTERNAL = /\b(hoy|ahora|actual|mercado|cotizaci[oó]n|precio|noticia|t[eé]cnico|fundamental|valuaci[oó]n)\b/i;
const TRADING = /\b(trading|trade|trades|longs?|shorts?|fees?|apalancamiento)\b/i;
const FACTUAL = /\b(cu[aá]nto|cu[aá]ntos|tengo|tenencia|posici[oó]n|saldo|total|pnl|gan[eé]|perd[ií]|resultado|liquidez|peso|porcentaje|fees?)\b/i;
const ANALYTICAL = /\b(conviene|deber[ií]a|parece|demasiado|riesgo|mejorar|patr[oó]n|por qu[eé]|recomend|analiz)\b/i;
const CONTRIBUTIONS = /\b(aportes?(?: netos?)?|capital (externo )?(neto )?aportado|ingresos? netos?)\b|\baport(?:e|é|aste|ó|o|amos|aron)(?=\s|[?.,!]|$)/i;
const WITHDRAWALS = /\b(retiros?|extracciones?)\b|\bretir(?:e|é|aste|ó|o|amos|aron)(?=\s|[?.,!]|$)/i;

function latestQuestion(messages = []) {
  return String([...messages].reverse().find((message) => message?.role === "user")?.content || "").trim();
}

function classifyTwinRoute(messages = []) {
  const question = latestQuestion(messages);
  const userQuestions=messages.filter(message=>message?.role==="user").map(message=>String(message.content||""));
  const previousQuestion=userQuestions.at(-2)||"";
  const contributionContext=[...userQuestions.slice(0,-1)].reverse().find(item=>CONTRIBUTIONS.test(item))||"";
  const withdrawalContext=[...userQuestions.slice(0,-1)].reverse().find(item=>WITHDRAWALS.test(item))||"";
  const tradingFollowUp=TRADING.test(previousQuestion)&&(/\b(eso|ese|esa|total|pero|entonces|y|en\s+20\d{2})\b/i.test(question)||FACTUAL.test(question));
  const contributionsFollowUp=Boolean(contributionContext)&&/\b(y|vale|valeria|horacio|eso|ese|esa|ambos|cada uno|20\d{2}|mes)\b/i.test(question);
  const withdrawalsFollowUp=Boolean(withdrawalContext)&&(WITHDRAWALS.test(question)||/\b(y|vale|valeria|horacio|eso|ese|esa|ambos|cada uno|20\d{2}|mes)\b/i.test(question));
  if (EXTERNAL.test(question)) return { route: "EXTERNAL_ANALYSIS", question, reason: "current_market_context" };
  if(withdrawalsFollowUp){
    const inheritedYear=withdrawalContext.match(/\b20\d{2}\b/)?.[0];
    const effectiveQuestion=`${question}${inheritedYear&&!/\b20\d{2}\b/.test(question)?` en ${inheritedYear}`:""}`;
    return{route:"WITHDRAWALS_DATA",question:effectiveQuestion,reason:"external_withdrawals_follow_up"};
  }
  if(WITHDRAWALS.test(question) && !ANALYTICAL.test(question)) return {route:"WITHDRAWALS_DATA",question,reason:"external_withdrawals_query"};
  if(contributionsFollowUp){
    const inheritedYear=contributionContext.match(/\b20\d{2}\b/)?.[0];
    const inheritedMonthly=/\b(por mes|mes por mes|mensual(?:es|mente)?)\b/i.test(contributionContext);
    const effectiveQuestion=`${question}${inheritedYear&&!/\b20\d{2}\b/.test(question)?` en ${inheritedYear}`:""}${inheritedMonthly&&!/\b(por mes|mes por mes|mensual(?:es|mente)?)\b/i.test(question)?" por mes":""}`;
    return{route:"CONTRIBUTIONS_DATA",question:effectiveQuestion,reason:"net_contributions_follow_up"};
  }
  if (CONTRIBUTIONS.test(question) && !ANALYTICAL.test(question)) return { route: "CONTRIBUTIONS_DATA", question, reason: "net_contributions_query" };
  if (((TRADING.test(question)&&FACTUAL.test(question))||tradingFollowUp) && !ANALYTICAL.test(question)) return { route: "TRADING_DATA", question, reason: tradingFollowUp?"factual_trading_follow_up":"factual_trading_query" };
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
  const groupedQuestion=/\b(cada uno|cada titular|por titular|por owner|ambos|ambas|los dos|las dos|entre\s+(horacio|vale|valeria))\b/i.test(question);
  if(groupedQuestion)return null;
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
  const year=Number(question.match(/\b(20\d{2})\b/)?.[1]);
  if(Number.isInteger(year)){
    const rows=await runQuery(`SELECT COUNT(*) AS total_trades,COALESCE(SUM(CAST(pnl_usd_calculated AS FLOAT64)),0) AS total_pnl_usd FROM ${table("vw_trading_trades_valued")} WHERE EXTRACT(YEAR FROM DATE(closed_at))=@year`,{year});
    const summary=rows[0]||{};
    return `En ${year}, tu resultado realizado de trading es ${usd(summary.total_pnl_usd)} sobre ${number(summary.total_trades,0)} trades.`;
  }
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

async function answerNetContributions(question){
  const year=Number(question.match(/\b(20\d{2})\b/)?.[1]);
  const requestedOwner=question.match(/\b(Horacio|Vale|Valeria)\b/i)?.[1];
  const owner=/^(vale|valeria)$/i.test(requestedOwner||"")?"Vale":/^horacio$/i.test(requestedOwner||"")?"Horacio":null;
  const bothOwners=/\b(nuestros?|aportamos|entre los dos|ambos|los dos)\b/i.test(question);
  const monthly=/\b(por mes|mes por mes|mensual(?:es|mente)?)\b/i.test(question);
  const dateFilter=Number.isInteger(year)?"AND EXTRACT(YEAR FROM fecha)=@year":"";
  const ownerFilter=owner?"AND LOWER(TRIM(owner))=LOWER(@owner)":bothOwners?"AND LOWER(TRIM(owner)) IN ('horacio','vale')":"";
  const amountSql=`CASE
    WHEN movement_type IN ('BUY_ASSET','BUY_USD','BUY_USDT','INCOME_USD') THEN 1
    WHEN movement_type IN ('SELL_ASSET','SELL_USD','SELL_USDT','EXPENSE_USD') THEN -1 ELSE 0 END * CASE
    WHEN movement_type IN ('BUY_ASSET','SELL_ASSET') THEN ABS(SAFE_CAST(net_amount AS FLOAT64))
    WHEN movement_type IN ('BUY_USD','SELL_USD','BUY_USDT','SELL_USDT') THEN ABS(SAFE_CAST(quantity AS FLOAT64))
    WHEN movement_type IN ('INCOME_USD','EXPENSE_USD') THEN ABS(SAFE_CAST(net_amount AS FLOAT64)) ELSE 0 END`;
  const rows=await runQuery(`SELECT ${monthly?"FORMAT_DATE('%Y-%m',fecha) AS period,":""} COALESCE(SUM(${amountSql}),0) AS net_contributions_usd
    FROM ${table("movements")} WHERE fecha IS NOT NULL ${dateFilter} ${ownerFilter} AND (
      source_table='transactions_raw' OR flow_type='EXTERNAL' OR
      (source_table='manual' AND movement_type='BUY_ASSET' AND settlement_currency='ARS') OR
      (transaction_group_id IS NULL AND NOT (movement_type IN ('BUY_USDT','SELL_USDT') AND flow_type='SETTLEMENT' AND NOT (source_table='cv_usdt_raw' AND movement_type='BUY_USDT' AND description='Venta BTC')) AND source_table NOT IN ('bingx_spot','trading_transfer'))
    ) ${monthly?"GROUP BY period ORDER BY period":""}` ,{...(Number.isInteger(year)?{year}:{}),...(owner?{owner}: {})});
  if(monthly){
    const total=rows.reduce((sum,row)=>sum+Number(row.net_contributions_usd||0),0);
    const detail=rows.map(row=>`${row.period}: ${usd(row.net_contributions_usd)}`).join("\n");
    return `Aportes netos por mes${Number.isInteger(year)?` de ${year}`:""}:\n${detail}\n\nTotal: ${usd(total)}.`;
  }
  const amount=rows[0]?.net_contributions_usd||0;
  const subject=owner?`${owner} registró`:bothOwners?"Entre Horacio y Vale registraron":"Registraste";
  return `${subject} ${usd(amount)} de aportes netos${Number.isInteger(year)?` durante ${year}`:' acumulados'}.`;
}

async function answerWithdrawals(question){
  const year=Number(question.match(/\b(20\d{2})\b/)?.[1]);
  const requestedOwner=question.match(/\b(Horacio|Vale|Valeria)\b/i)?.[1];
  const owner=/^(vale|valeria)$/i.test(requestedOwner||"")?"Vale":/^horacio$/i.test(requestedOwner||"")?"Horacio":null;
  const bothOwners=/\b(nuestros?|retiramos|entre los dos|ambos|los dos)\b/i.test(question);
  const dateFilter=Number.isInteger(year)?"AND EXTRACT(YEAR FROM fecha)=@year":"";
  const ownerFilter=owner?"AND LOWER(TRIM(owner))=LOWER(@owner)":bothOwners?"AND LOWER(TRIM(owner)) IN ('horacio','vale')":"";
  const rows=await runQuery(`SELECT COALESCE(SUM(CASE
    WHEN movement_type IN ('SELL_USD','SELL_USDT') THEN ABS(SAFE_CAST(quantity AS FLOAT64))
    WHEN movement_type='EXPENSE_USD' THEN ABS(SAFE_CAST(net_amount AS FLOAT64))
    ELSE 0 END),0) AS withdrawals_usd
    FROM ${table("movements")} WHERE fecha IS NOT NULL ${dateFilter} ${ownerFilter}
      AND movement_type IN ('SELL_USD','SELL_USDT','EXPENSE_USD') AND (
        source_table='transactions_raw' OR flow_type='EXTERNAL' OR
        (transaction_group_id IS NULL AND NOT (movement_type IN ('SELL_USDT') AND flow_type='SETTLEMENT') AND source_table NOT IN ('bingx_spot','trading_transfer'))
      )`,{...(Number.isInteger(year)?{year}:{}),...(owner?{owner}:{})});
  const amount=rows[0]?.withdrawals_usd||0;
  const subject=owner?owner:bothOwners?"Horacio y Vale":"Tu portfolio";
  return `${subject}: ${usd(amount)} de retiros externos${Number.isInteger(year)?` durante ${year}`:" acumulados"}.`;
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
  if(route.route==="CONTRIBUTIONS_DATA"){
    const answer=await answerNetContributions(route.question);
    return{answer,route:route.route,dataSources:["movements"]};
  }
  if(route.route==="WITHDRAWALS_DATA"){
    const answer=await answerWithdrawals(route.question);
    return{answer,route:route.route,dataSources:["movements"]};
  }
  return null;
}

module.exports = { answerPortfolioQuestion, classifyTwinRoute, resolveRoutedQuestion };
