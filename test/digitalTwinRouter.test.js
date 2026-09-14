const test = require("node:test");
const assert = require("node:assert/strict");

process.env.BIGQUERY_PROJECT_ID ||= "test-project";
process.env.BIGQUERY_DATASET_ID ||= "test-dataset";

const { answerPortfolioQuestion, classifyTwinRoute } = require("../src/services/digitalTwinRouterService");
const { matches, normalizePlanTaxonomy } = require("../src/services/digitalTwinPortfolioAgentService");

const messages = (content) => [{ role: "user", content }];

test("routes factual portfolio questions without an LLM", () => {
  assert.equal(classifyTwinRoute(messages("¿Cuánto BTC tengo?")).route, "INTERNAL_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuál es mi liquidez?")).route, "INTERNAL_DATA");
});

test("routes factual trading questions to trading data", () => {
  assert.equal(classifyTwinRoute(messages("¿Cuánto gané haciendo trading?")).route, "TRADING_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuánto pagué de fees?")).route, "TRADING_DATA");
});

test("routes net contribution questions to the canonical calculation", () => {
  assert.equal(classifyTwinRoute(messages("¿Cuántos ingresos netos hizo Horacio este 2026?")).route, "CONTRIBUTIONS_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuáles fueron los aportes netos de Vale?")).route, "CONTRIBUTIONS_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuánto aportamos entre los dos en 2026?")).route, "CONTRIBUTIONS_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cuánto aporté en 2026?")).route, "CONTRIBUTIONS_DATA");
  assert.equal(classifyTwinRoute(messages("¿Cómo se distribuyeron nuestros aportes de 2026 por mes?")).route, "CONTRIBUTIONS_DATA");
});

test("routes withdrawals before inherited contribution context", () => {
  const route=classifyTwinRoute([
    {role:"user",content:"¿Cómo se distribuyeron nuestros aportes de 2026 por mes?"},
    {role:"assistant",content:"Aportes por mes..."},
    {role:"user",content:"¿Cuánto retiramos entre los dos en 2026?"},
  ]);
  assert.equal(route.route,"WITHDRAWALS_DATA");
});

test("inherits withdrawals, year and owner grouping across follow-ups", () => {
  const conversation=[
    {role:"user",content:"¿Cómo se distribuyeron nuestros aportes de 2026 por mes?"},
    {role:"assistant",content:"Aportes..."},
    {role:"user",content:"¿Cuánto retiramos entre los dos en 2026?"},
    {role:"assistant",content:"Retiros..."},
    {role:"user",content:"¿Cuánto retiró cada uno?"},
  ];
  const grouped=classifyTwinRoute(conversation);
  assert.equal(grouped.route,"WITHDRAWALS_DATA");
  assert.match(grouped.question,/cada uno.*2026/i);

  conversation.push(
    {role:"assistant",content:"Vale... Horacio..."},
    {role:"user",content:"¿Y en 2025?"}
  );
  const nextYear=classifyTwinRoute(conversation);
  assert.equal(nextYear.route,"WITHDRAWALS_DATA");
  assert.match(nextYear.question,/2025.*por titular|por titular.*2025/i);
});

test("explicit monthly withdrawals do not inherit an earlier owner grouping", () => {
  const route=classifyTwinRoute([
    {role:"user",content:"¿Cuánto retiró cada uno en 2026?"},
    {role:"assistant",content:"Horacio... Vale..."},
    {role:"user",content:"¿Cómo se distribuyeron los retiros de 2026 por mes?"},
  ]);
  assert.equal(route.route,"WITHDRAWALS_DATA");
  assert.match(route.question,/2026.*por mes/i);
  assert.doesNotMatch(route.question,/por titular/i);
});

test("inherits contribution metric and year in owner follow-ups", () => {
  const route=classifyTwinRoute([
    {role:"user",content:"¿Cuántos aportes netos hizo Horacio en 2026?"},
    {role:"assistant",content:"Horacio registró..."},
    {role:"user",content:"¿Y Vale?"},
  ]);
  assert.equal(route.route,"CONTRIBUTIONS_DATA");
  assert.match(route.question,/Vale.*2026/i);
});

test("inherits monthly contribution grouping across multiple follow-ups", () => {
  const conversation=[
    {role:"user",content:"¿Cómo se distribuyeron nuestros aportes de 2026 por mes?"},
    {role:"assistant",content:"Aportes por mes..."},
    {role:"user",content:"¿Y solamente los de Vale?"},
  ];
  const first=classifyTwinRoute(conversation);
  assert.equal(first.route,"CONTRIBUTIONS_DATA");
  assert.match(first.question,/Vale.*2026.*por mes/i);
  conversation.push({role:"assistant",content:"Vale registró..."},{role:"user",content:"¿Los de Vale mes por mes?"});
  assert.equal(classifyTwinRoute(conversation).route,"CONTRIBUTIONS_DATA");
});

test("keeps factual trading follow-ups in trading context", () => {
  const conversation = [
    { role: "user", content: "¿Cuánto generé en trading en 2026?" },
    { role: "assistant", content: "Tu resultado total..." },
    { role: "user", content: "¿Eso es total, pero en 2026?" },
  ];
  assert.equal(classifyTwinRoute(conversation).route, "TRADING_DATA");
  conversation[2] = { role: "user", content: "¿Y en 2025?" };
  assert.equal(classifyTwinRoute(conversation).route, "TRADING_DATA");
});

test("does not let withdrawal history hijack a new BTC performance question", () => {
  const route=classifyTwinRoute([
    {role:"user",content:"¿Cuánto retiró cada uno en 2026?"},
    {role:"assistant",content:"Horacio... Vale..."},
    {role:"user",content:"¿Y en 2025?"},
    {role:"assistant",content:"Horacio... Vale..."},
    {role:"user",content:"¿Cuánto ganamos o perdimos con BTC en 2026 y cómo se distribuye entre Horacio y Vale?"},
  ]);
  assert.equal(route.route,"TWIN_ANALYSIS");
});

test("keeps current custody distributions on internal portfolio data", () => {
  const route=classifyTwinRoute(messages("¿Cómo se distribuye mi posición actual de TSLA por plataforma y titular?"));
  assert.equal(route.route,"TWIN_ANALYSIS");
  assert.equal(route.reason,"current_position_data");

  const plan=normalizePlanTaxonomy({
    datasets:["performance"],
    filters:{ticker:"TSLA",owner:"Horacio",broker:null,category:null,side:null,dateFrom:"2026-01-01",dateTo:"2026-12-31"},
    calculation:"summary",metric:null,groupBy:null,
  },"¿Cómo se distribuye mi posición actual de TSLA por plataforma y titular?");
  assert.deepEqual(plan.datasets,["holdings"]);
  assert.equal(plan.filters.owner,null);
  assert.equal(plan.groupBy,"platform_owner");
});

test("inherits the asset in custody owner platform follow-ups", () => {
  const route=classifyTwinRoute([
    {role:"user",content:"¿Cómo se distribuye mi posición actual de TSLA por plataforma y titular?"},
    {role:"assistant",content:"IBKR · Horacio..."},
    {role:"user",content:"¿Y cuánto corresponde solamente a Vale y cómo se distribuye entre sus plataformas?"},
  ]);
  assert.equal(route.route,"TWIN_ANALYSIS");
  assert.equal(route.reason,"current_position_follow_up");
  assert.match(route.question,/Vale.*plataformas.*TSLA/i);

  const plan=normalizePlanTaxonomy({
    datasets:["holdings"],
    filters:{ticker:"TSLA",owner:"Vale",broker:null,category:null,side:null,dateFrom:null,dateTo:null},
    calculation:"group",metric:"market_value_usd",groupBy:"platform",
  },route.question);
  assert.equal(plan.filters.owner,"Vale");
  assert.equal(plan.groupBy,"platform");
});

test("keeps current position PnL on internal portfolio data", () => {
  const route=classifyTwinRoute(messages("Recalculá el PnL actual de BTC por titular"));
  assert.equal(route.route,"TWIN_ANALYSIS");
  assert.equal(route.reason,"current_position_pnl");
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

test("answers ownership with value and distinct asset count", () => {
  const answer = answerPortfolioQuestion("¿Cuántos activos están a nombre de Horacio y cuántos de Valeria?", {
    ownership: [
      { owner: "Horacio", valueUsd: 180000, assetCount: 14, weightPct: 75 },
      { owner: "Valeria", valueUsd: 60000, assetCount: 6, weightPct: 25 },
    ],
  });
  assert.match(answer, /Horacio: US\$.*180\.000,00 en 14 activos \(75%\)/);
  assert.match(answer, /Valeria: US\$.*60\.000,00 en 6 activos \(25%\)/);
});

test("does not use the ownership fast path when another filter is requested", () => {
  const answer = answerPortfolioQuestion("¿Cuánto tiene Valeria en crypto?", {
    ownership: [{ owner: "Valeria", valueUsd: 60000, assetCount: 6, weightPct: 25 }],
  });
  assert.equal(answer, null);
});

test("does not use a total holding fast path for grouped owner questions", () => {
  const context = { holdings: [{ ticker: "USDT", quantity: 8000, valueUsd: 7990 }] };
  assert.equal(answerPortfolioQuestion("¿Cuánto USDT tiene cada uno?", context), null);
  assert.equal(answerPortfolioQuestion("¿Cómo se distribuye USDT por titular?", context), null);
});

test("generic data tools combine owner, asset, broker and dates", () => {
  const row = { ticker: "BTC", owner: "Valeria", broker: "BingX", side: "BUY", fecha: "2026-08-14" };
  assert.equal(matches(row, { ticker: "BTC", owner: "Valeria", broker: "BingX", side: "BUY", dateFrom: "2026-08-01", dateTo: "2026-08-31" }), true);
  assert.equal(matches(row, { owner: "Horacio" }), false);
  assert.equal(matches(row, { dateFrom: "2026-09-01" }), false);
});

test("distinguishes the technical USDT category from economic cryptocurrencies", () => {
  assert.equal(matches({ normalized_ticker: "USDT", category: "CRYPTO", owner: "Valeria" }, { ticker: "USDT", category: "crypto", owner: "Valeria" }), true);
  assert.equal(matches({ normalized_ticker: "BTC", category: "PORTFOLIO", owner: "Valeria" }, { category: "cryptocurrency", owner: "Valeria" }), true);
  assert.equal(matches({ normalized_ticker: "TSLA", category: "PORTFOLIO", owner: "Valeria" }, { category: "cryptocurrency", owner: "Valeria" }), false);
});

test("enforces the app taxonomy after LLM planning", () => {
  const wrongPlan = { filters: { owner: "Valeria", category: "cryptocurrency" } };
  assert.equal(normalizePlanTaxonomy(wrongPlan, "¿Cuánto tiene Vale en crypto?").filters.category, "cryptocurrency");
  assert.equal(normalizePlanTaxonomy(wrongPlan, "¿Cuánto tiene Vale en criptomonedas?").filters.category, "cryptocurrency");
  assert.deepEqual(normalizePlanTaxonomy(wrongPlan, "¿Cuánto USDT tiene Vale?").filters, { owner: "Valeria", category: "crypto", ticker: "USDT" });
  const grouped = normalizePlanTaxonomy(wrongPlan, "¿Cuánto USDT tiene cada uno?");
  assert.equal(grouped.filters.owner, null);
  assert.equal(grouped.groupBy, "owner");
});

test("plans current asset PnL by owner from holdings without historical dates", () => {
  const plan=normalizePlanTaxonomy({
    datasets:["performance"],
    filters:{ticker:"BTC",owner:"Horacio y Vale",dateFrom:"2026-01-01",dateTo:"2026-12-31"},
    calculation:"sum",
    metric:"return",
    groupBy:null,
  },"¿Cuánto ganamos o perdemos actualmente con BTC y cómo se distribuye entre Horacio y Vale?");
  assert.deepEqual(plan.datasets,["holdings"]);
  assert.equal(plan.filters.ticker,"BTC");
  assert.equal(plan.filters.owner,null);
  assert.equal(plan.filters.dateFrom,null);
  assert.equal(plan.filters.dateTo,null);
  assert.equal(plan.groupBy,"owner");
  assert.equal(plan.metric,"pnl_usd");
});

test("normalizes Valeria to the canonical owner Vale", () => {
  assert.equal(matches({ ticker: "ETH", owner: "Vale", category: "PORTFOLIO" }, { owner: "Valeria", category: "cryptocurrency" }), true);
});

test("uses reconciled custody rows as the only source for owner PnL", async () => {
  const plan={
    datasets:["holdings"],
    filters:{ticker:"TSLA",owner:null,broker:null,category:null,side:null,dateFrom:null,dateTo:null},
    calculation:"group",
    metric:"pnl_usd",
    groupBy:"owner",
  };
  const data=await require("../src/services/digitalTwinPortfolioAgentService").executePlan(plan,{
    portfolio:{
      holdings:[{ticker:"TSLA",quantity:100,valueUsd:1000,costUsd:800,pnlUsd:200}],
      ownerHoldings:[
        {ticker:"BCBA:TSLA",normalized_ticker:"TSLA",owner:"Horacio",platform:"BMB",market_value_usd:600,quantity:60},
        {ticker:"TSLA",normalized_ticker:"TSLA",owner:"Vale",platform:"Cocos Vale",market_value_usd:400,quantity:40},
      ],
    },
  });
  assert.deepEqual(data.computed_summary.holdings.owners.sort(),["Horacio","Vale"]);
  assert.equal(data.computed_summary.holdings.market_value_usd,1000);
  assert.equal(data.computed_summary.holdings.cost_value_usd,800);
  assert.equal(data.computed_summary.holdings.pnl_usd,200);
  assert.deepEqual(
    data.computed_summary.holdings.by_platform_owner.map(row=>row.name).sort(),
    ["BMB · Horacio","Cocos Vale · Vale"],
  );
});

test("uses owner-aware holdings from the request context", async () => {
  const plan = { datasets: ["holdings"], filters: { owner: "Valeria", category: "crypto" } };
  const data = await require("../src/services/digitalTwinPortfolioAgentService").executePlan(plan, {
    portfolio: { ownerHoldings: [
      { ticker: "USDT", owner: "Valeria", category: "CRYPTO", market_value_usd: 100 },
      { ticker: "BTC", owner: "Horacio", category: "PORTFOLIO", market_value_usd: 200 },
    ] },
  });
  assert.deepEqual(data.holdings, [{ ticker: "USDT", owner: "Valeria", category: "CRYPTO", market_value_usd: 100, market_value: 100, value_usd: 100 }]);
  assert.equal(data.computed_summary.holdings.market_value_usd, 100);
});
