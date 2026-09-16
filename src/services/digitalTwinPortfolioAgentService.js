const axios = require("axios");
const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.DIGITAL_TWIN_DATA_MODEL || process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const DATASETS = {
  holdings: "vw_portfolio_valued",
  movements: "movements",
  trading_summary: "vw_trading_summary",
  trading_by_asset: "vw_trading_by_asset",
  trading_trades: "vw_trading_trades_valued",
  performance: "vw_asset_performance",
};
const FILTER_PROPERTIES={ticker:{type:["string","null"]},owner:{type:["string","null"]},broker:{type:["string","null"]},category:{type:["string","null"]},side:{type:["string","null"]},dateFrom:{type:["string","null"]},dateTo:{type:["string","null"]}};
const FILTER_REQUIRED=Object.keys(FILTER_PROPERTIES);
const FILTER_SCHEMA={type:"object",additionalProperties:false,properties:FILTER_PROPERTIES,required:FILTER_REQUIRED};
const PLAN_SCHEMA={type:"object",additionalProperties:false,properties:{
  route:{type:"string",enum:["PORTFOLIO_DATA","TWIN_ANALYSIS"]},
  intent:{type:"string",enum:["summary","list","count","sum","compare","distribution","ratio","analysis"]},
  datasets:{type:"array",maxItems:3,items:{type:"string",enum:Object.keys(DATASETS)}},
  filters:FILTER_SCHEMA,
  denominatorFilters:{anyOf:[FILTER_SCHEMA,{type:"null"}]},
  calculation:{type:"string",enum:["summary","list","count","sum","compare","group"]},
  metric:{type:["string","null"]},
  groupBy:{type:["string","null"]},
  reason:{type:"string"}
},required:["route","intent","datasets","filters","denominatorFilters","calculation","metric","groupBy","reason"]};

function outputText(response){if(response?.output_text)return response.output_text;const parts=[];for(const item of response?.output||[])for(const content of item?.content||[])if(content?.type==="output_text"&&content?.text)parts.push(content.text);return parts.join("\n").trim()}
function parseJson(text){return JSON.parse(String(text||"").trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}
async function post(body){if(!process.env.OPENAI_API_KEY){const error=new Error("OPENAI_API_KEY is not configured");error.code="OPENAI_NOT_CONFIGURED";throw error}return(await axios.post(OPENAI_RESPONSES_URL,body,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},timeout:60000})).data}
function usageStage(stage,data){return{stage,model:data?.model||MODEL,apiRequests:1,webSearchCalls:0,usage:data?.usage||null}}
function lastQuestion(messages=[]){return String([...messages].reverse().find(x=>x?.role==="user")?.content||"").trim()}
function planningConversation(messages=[]){return messages.slice(-8).map(message=>`${message.role==="assistant"?"TWIN":"USUARIO"}: ${String(message.content||"").slice(0,1200)}`).join("\n")}
function normalizePlanTaxonomy(plan={},question=""){
  const normalized={...plan,filters:{...(plan.filters||{})},denominatorFilters:plan.denominatorFilters?{...plan.denominatorFilters}:null};
  const q=text(question);
  if(!normalized.intent)normalized.intent=normalized.calculation==="group"?"distribution":normalized.calculation||"summary";
  if(normalized.intent==="distribution")normalized.calculation="group";
  if(normalized.intent==="ratio")normalized.calculation="sum";
  const canonicalOwner=(owner)=>{
    const value=ownerText(owner);
    if(value==="horacio")return "Horacio";
    if(value==="vale")return "Vale";
    return null;
  };
  if(normalized.filters.owner)normalized.filters.owner=canonicalOwner(normalized.filters.owner);
  if(normalized.denominatorFilters?.owner)normalized.denominatorFilters.owner=canonicalOwner(normalized.denominatorFilters.owner);
  if(/\b(cada uno|cada titular|por titular|por owner|ambos|ambas|los dos|las dos)\b/.test(q)){
    normalized.filters.owner=null;
    normalized.calculation="group";
    normalized.groupBy="owner";
  }
  const asksPlatformDimension=/\b(cada plataforma|por plataforma|plataformas?|brokers?)\b/.test(q);
  const asksOwnerDimension=/\b(titular|titulares|por owner)\b/.test(q);
  if(asksPlatformDimension&&asksOwnerDimension){
    normalized.datasets=["holdings"];
    normalized.filters.owner=null;
    normalized.filters.dateFrom=null;
    normalized.filters.dateTo=null;
    normalized.calculation="group";
    normalized.metric="market_value_usd";
    normalized.groupBy="platform_owner";
  }
  if(/\busdt\b|d[oó]lares? digitales?/.test(q)){
    normalized.filters.ticker="USDT";
    normalized.filters.category="crypto";
  }else if(/\b(crypto|cripto|criptomonedas?)\b/.test(q))normalized.filters.category="cryptocurrency";
  if(/\b(posici[oó]n|tenencia|distribu(?:ye|ci[oó]n))\b/.test(q)&&/\b(actual|actualmente|hoy)\b/.test(q)&&/\b(titular|owner|plataforma|broker)\b/.test(q)){
    normalized.datasets=["holdings"];
    normalized.filters.dateFrom=null;
    normalized.filters.dateTo=null;
    normalized.calculation="group";
    normalized.metric=normalized.metric||"market_value_usd";
    const asksOwner=/\b(titular|owner|cada uno|ambos|los dos)\b/.test(q),asksPlatform=/\b(plataforma|broker)\b/.test(q);
    if(asksOwner)normalized.filters.owner=null;
    normalized.groupBy=asksOwner&&asksPlatform?"platform_owner":asksPlatform?"platform":"owner";
  }
  if(/\b(ganamos|ganancia|ganancias|perdemos|p[eé]rdida|p[eé]rdidas|pnl)\b/.test(q)&&/\b(actual|actualmente|hoy|posici[oó]n)\b/.test(q)){
    normalized.datasets=["holdings"];
    normalized.filters.owner=null;
    normalized.filters.dateFrom=null;
    normalized.filters.dateTo=null;
    normalized.calculation="group";
    normalized.groupBy="owner";
    normalized.metric="pnl_usd";
  }
  return normalized;
}

async function planPortfolioQuestion(messages=[]){
  const question=lastQuestion(messages),data=await post({model:MODEL,reasoning:{effort:"low"},instructions:`Clasificá la última pregunta de una conversación para una app personal de inversiones. Interpretá la conversación semánticamente y conservá filtros implícitos de turnos anteriores. Generá un plan declarativo, no dependiente de frases exactas. Usá intent=distribution cuando pidan un desglose y groupBy con la dimensión solicitada. Usá intent=ratio cuando pidan una proporción: filters define el numerador y denominatorFilters define exactamente el universo del denominador. Ejemplos: "Cocos Vale sobre todo el portfolio" usa filters.owner=Vale + filters.broker=Cocos Vale y denominatorFilters con todos los campos null; "qué porcentaje de lo de Vale está en Cocos Vale" usa el mismo numerador y denominatorFilters.owner=Vale. Para preguntas que no sean ratios, denominatorFilters=null. PORTFOLIO_DATA si puede responderse exclusivamente con datos propios: holdings, movimientos, titulares, brokers/plataformas, aportes, compras/ventas, PnL/performance histórica o trading. TWIN_ANALYSIS si pide opinión, recomendación, explicación causal, patrones, riesgo cualitativo o qué debería hacer. Vocabulario del usuario: "crypto", "cripto" y "criptomonedas" significan criptomonedas económicas como BTC, ETH, SOL y RON, aunque estén registradas como category=PORTFOLIO e instrument_type=ASSET; usá category=cryptocurrency. Sólo cuando mencione USDT o dólares digitales usá ticker=USDT y category=crypto, que es su categoría técnica. Para una moneda concreta usá ticker. Para distribución por broker/plataforma usá holdings y agrupá por broker. Elegí sólo los datasets mínimos. metric y groupBy deben ser nombres conceptuales breves; nunca generes SQL. Fechas en YYYY-MM-DD; resolvé referencias como "agosto" usando fecha actual ${new Date().toISOString().slice(0,10)}.`,input:planningConversation(messages),max_output_tokens:700,text:{verbosity:"low",format:{type:"json_schema",name:"portfolio_query_plan",strict:true,schema:PLAN_SCHEMA}},store:false});
  const plan=normalizePlanTaxonomy(parseJson(outputText(data)),question);
  if(plan.filters?.broker){
    plan.filters.broker=await resolveCustodyBrokerAlias(plan.filters.broker);
  }else if(/\b(en|plataforma|broker)\b/i.test(question)){
    const brokerFromQuestion=await resolveCustodyBrokerAlias(question);
    if(brokerFromQuestion!==question)plan.filters.broker=brokerFromQuestion;
  }
  return{plan,usageStage:usageStage("data_planner",data)};
}

function value(row,...keys){for(const key of keys)if(row?.[key]!=null)return row[key];return null}
function text(value){return String(value??"").trim().toLowerCase()}
function ownerText(value){const normalized=text(value);return normalized==="valeria"?"vale":normalized}
function rowDate(row){const raw=value(row,"fecha","date","created_at","closed_at","opened_at");return String(raw?.value||raw||"").slice(0,10)}
function matches(row,filters={}){
  const ticker=text(value(row,"normalized_ticker","ticker","instrument","asset","underlying_ticker"));
  if(filters.ticker&&!ticker.includes(text(filters.ticker)))return false;
  if(filters.owner&&ownerText(value(row,"owner","titular"))!==ownerText(filters.owner))return false;
  if(filters.broker&&text(value(row,"broker","platform","exchange"))!==text(filters.broker))return false;
  if(filters.category){const requested=text(filters.category),category=text(value(row,"category","asset_class")),economicTicker=ticker.replace(/^currency:|ars$|usd$/g,""),isCryptocurrency=["btc","eth","sol","ron"].includes(economicTicker);if(requested==="cryptocurrency"||requested==="criptomoneda"||requested==="criptomonedas"){if(!isCryptocurrency)return false}else if(category!==requested)return false}
  if(filters.side&&text(value(row,"side","direction"))!==text(filters.side))return false;
  const date=rowDate(row);if(filters.dateFrom&&date&&date<filters.dateFrom)return false;if(filters.dateTo&&date&&date>filters.dateTo)return false;
  return true;
}
function scalar(value){
  if(value==null)return value;
  if(value instanceof Date)return value.toISOString();
  if(typeof value!=="object")return value;
  if(Object.prototype.hasOwnProperty.call(value,"value"))return value.value;
  return undefined;
}
function compact(rows=[]){return rows.slice(0,250).map(row=>{
  const compacted=Object.fromEntries(Object.entries(row).map(([key,val])=>[key,scalar(val)]).filter(([,val])=>val!=null).slice(0,24));
  if(compacted.market_value_usd!=null){compacted.market_value=compacted.market_value_usd;compacted.value_usd=compacted.market_value_usd}
  return compacted;
})}
function summarizeResults(results={}){
  const summary={};
  for(const [dataset,rows] of Object.entries(results)){
    if(!Array.isArray(rows))continue;
    const hasCost=rows.some(row=>row.cost_value_usd!=null);
    const hasPnl=rows.some(row=>row.pnl_usd!=null);
    const groupValue=(key)=>Object.values(rows.reduce((groups,row)=>{
      const keys=Array.isArray(key)?key:[key];
      const groupField=(item)=>item==="platform"?value(row,"platform","broker"):item==="owner"?value(row,"owner","titular"):value(row,item);
      const name=keys.map(item=>String(groupField(item)||"Sin especificar")).join(" · ");
      const current=groups[name]||{name,market_value_usd:0,quantity:0};
      current.market_value_usd+=Number(row.market_value_usd??row.value_usd??row.market_value)||0;
      if(row.cost_value_usd!=null)current.cost_value_usd=(current.cost_value_usd||0)+Number(row.cost_value_usd||0);
      if(row.pnl_usd!=null)current.pnl_usd=(current.pnl_usd||0)+Number(row.pnl_usd||0);
      current.quantity+=Number(row.quantity??row.quantity_net)||0;
      groups[name]=current;
      return groups;
    },{})).sort((a,b)=>b.market_value_usd-a.market_value_usd);
    summary[dataset]={
      record_count:rows.length,
      market_value_usd:rows.reduce((sum,row)=>sum+(Number(row.market_value_usd??row.value_usd??row.market_value)||0),0),
      ...(hasCost?{cost_value_usd:rows.reduce((sum,row)=>sum+Number(row.cost_value_usd||0),0)}:{}),
      ...(hasPnl?{pnl_usd:rows.reduce((sum,row)=>sum+Number(row.pnl_usd||0),0)}:{}),
      quantity:rows.reduce((sum,row)=>sum+(Number(row.quantity??row.quantity_net)||0),0),
      tickers:[...new Set(rows.map(row=>value(row,"normalized_ticker","ticker","instrument")).filter(Boolean))],
      owners:[...new Set(rows.map(row=>value(row,"owner","titular")).filter(Boolean))],
      by_ticker:groupValue("ticker"),
      by_platform:groupValue("platform"),
      by_owner:groupValue("owner"),
      by_platform_owner:groupValue(["platform","owner"]),
    };
  }
  return summary;
}

async function loadOwnerHoldings(){
  return runQuery(`
    WITH movement_legs AS (
      SELECT
        COALESCE(
          (SELECT ANY_VALUE(UPPER(COALESCE(NULLIF(v.normalized_ticker, ''), v.ticker)))
           FROM ${table("vw_portfolio_valued")} v WHERE UPPER(v.ticker) = UPPER(m.ticker)),
          CASE
            WHEN STARTS_WITH(UPPER(m.ticker), 'CURRENCY:') AND ENDS_WITH(UPPER(m.ticker), 'ARS')
              THEN REGEXP_REPLACE(REGEXP_REPLACE(UPPER(m.ticker), r'^CURRENCY:', ''), r'ARS$', '')
            WHEN STARTS_WITH(UPPER(m.ticker), 'CURRENCY:') THEN REGEXP_REPLACE(UPPER(m.ticker), r'^CURRENCY:', '')
            ELSE UPPER(TRIM(m.ticker))
          END
        ) AS ticker,
        COALESCE(NULLIF(TRIM(m.owner), ''), 'Sin titular') AS owner,
        COALESCE(NULLIF(TRIM(m.broker), ''), 'Sin plataforma') AS platform,
        SUM(CASE
          WHEN m.movement_type IN ('BUY_ASSET','BUY_USD','BUY_USDT','INCOME_USD')
            THEN ABS(CAST(COALESCE(m.quantity,m.net_amount,m.gross_amount) AS FLOAT64))
          WHEN m.movement_type IN ('SELL_ASSET','SELL_USD','SELL_USDT','EXPENSE_USD')
            THEN -ABS(CAST(COALESCE(m.quantity,m.net_amount,m.gross_amount) AS FLOAT64))
          ELSE 0 END) AS quantity
      FROM ${table("movements")} m
      WHERE m.movement_type IN ('BUY_ASSET','SELL_ASSET','BUY_USD','SELL_USD','INCOME_USD','EXPENSE_USD','BUY_USDT','SELL_USDT')
        AND COALESCE(m.quantity,m.net_amount,m.gross_amount) IS NOT NULL
        AND (UPPER(m.ticker) = 'USDT' OR NOT REGEXP_CONTAINS(LOWER(COALESCE(m.description,'')), r'posici[oó]n cerrada'))
      GROUP BY 1,2,3
    ), transfer_legs AS (
      SELECT UPPER(TRIM(ticker)) ticker,COALESCE(NULLIF(TRIM(owner),''),'Sin titular') owner,from_broker platform,-CAST(quantity AS FLOAT64) quantity FROM ${table("custody_transfers")}
      UNION ALL
      SELECT UPPER(TRIM(ticker)),COALESCE(NULLIF(TRIM(owner),''),'Sin titular'),to_broker,CAST(quantity AS FLOAT64) FROM ${table("custody_transfers")}
    ), assigned AS (
      SELECT l.ticker,
        COALESCE((SELECT ANY_VALUE(a.owner) FROM ${table("custody_owner_assignments")} a
          WHERE UPPER(a.ticker)=l.ticker AND LOWER(TRIM(a.platform))=LOWER(TRIM(l.platform))),l.owner) owner,
        l.platform,l.quantity
      FROM (SELECT * FROM movement_legs UNION ALL SELECT * FROM transfer_legs) l
    ), located AS (
      SELECT ticker,owner,platform,SUM(quantity) quantity FROM assigned GROUP BY 1,2,3
    ), located_totals AS (
      SELECT ticker,SUM(quantity) located_quantity FROM located GROUP BY 1
    ), valued_source AS (
      SELECT
        UPPER(COALESCE(NULLIF(normalized_ticker,''),ticker)) ticker,
        CAST(quantity_net AS FLOAT64) quantity_net,
        CAST(market_value_usd AS FLOAT64) market_value_usd,
        CAST(cost_value_usd AS FLOAT64) cost_value_usd
      FROM ${table("vw_portfolio_valued")}
    ), valued AS (
      SELECT ticker,
        IF(ticker IN ('BTC','ETH','SOL','RON'),
          ARRAY_AGG(quantity_net ORDER BY market_value_usd DESC LIMIT 1)[OFFSET(0)],
          SUM(quantity_net)) expected_quantity,
        IF(ticker IN ('BTC','ETH','SOL','RON'),
          SAFE_DIVIDE(
            ARRAY_AGG(market_value_usd ORDER BY market_value_usd DESC LIMIT 1)[OFFSET(0)],
            NULLIF(ARRAY_AGG(quantity_net ORDER BY market_value_usd DESC LIMIT 1)[OFFSET(0)],0)),
          SAFE_DIVIDE(SUM(market_value_usd),NULLIF(SUM(quantity_net),0))) unit_value_usd,
        IF(ticker IN ('BTC','ETH','SOL','RON'),
          SAFE_DIVIDE(
            ARRAY_AGG(cost_value_usd ORDER BY market_value_usd DESC LIMIT 1)[OFFSET(0)],
            NULLIF(ARRAY_AGG(quantity_net ORDER BY market_value_usd DESC LIMIT 1)[OFFSET(0)],0)),
          SAFE_DIVIDE(SUM(cost_value_usd),NULLIF(SUM(quantity_net),0))) unit_cost_usd
      FROM valued_source GROUP BY ticker
    )
    SELECT l.ticker,l.owner,l.platform,
      l.quantity*SAFE_DIVIDE(v.expected_quantity,t.located_quantity) AS quantity,
      CASE WHEN l.ticker='USDT' THEN 'CRYPTO' ELSE 'PORTFOLIO' END category,
      l.quantity*SAFE_DIVIDE(v.expected_quantity,t.located_quantity)*v.unit_value_usd AS market_value_usd,
      l.quantity*SAFE_DIVIDE(v.expected_quantity,t.located_quantity)*v.unit_cost_usd AS cost_value_usd,
      l.quantity*SAFE_DIVIDE(v.expected_quantity,t.located_quantity)*(v.unit_value_usd-v.unit_cost_usd) AS pnl_usd
    FROM located l
    JOIN located_totals t USING(ticker)
    JOIN valued v USING(ticker)
    WHERE l.quantity > 0.00000001 AND t.located_quantity > 0 AND v.expected_quantity > 0
  `);
}

function brokerKey(value){
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}
function resolveCustodyBrokerAliasFromRows(broker,rows=[]){
  if(!broker)return broker;
  const requested=brokerKey(broker);
  const exact=rows.find(row=>brokerKey(row.raw_broker)===requested||brokerKey(row.canonical_broker)===requested);
  if(exact)return exact.canonical_broker;
  const compatible=rows.filter(row=>{
    const raw=brokerKey(row.raw_broker),canonical=brokerKey(row.canonical_broker);
    return requested.length>=5&&(raw.includes(requested)||requested.includes(raw)||canonical.includes(requested)||requested.includes(canonical));
  });
  const canonical=[...new Set(compatible.map(row=>row.canonical_broker).filter(Boolean))];
  return canonical.length===1?canonical[0]:broker;
}
async function resolveCustodyBrokerAlias(broker){
  if(!broker)return broker;
  const rows=await runQuery(`SELECT raw_broker,canonical_broker FROM ${table("custody_broker_aliases")}
    ORDER BY created_at DESC LIMIT 250`);
  return resolveCustodyBrokerAliasFromRows(broker,rows);
}

async function executePlan(plan={},requestContext={}){
  const effectivePlan={...plan,filters:{...(plan.filters||{})}};
  if(effectivePlan.filters.broker){
    const contextAliases=Array.isArray(requestContext?.portfolio?.custodyBrokerAliases)?requestContext.portfolio.custodyBrokerAliases:[];
    effectivePlan.filters.broker=contextAliases.length
      ?resolveCustodyBrokerAliasFromRows(effectivePlan.filters.broker,contextAliases)
      :await resolveCustodyBrokerAlias(effectivePlan.filters.broker);
  }
  const selected=(effectivePlan.datasets||[]).filter(name=>DATASETS[name]).slice(0,3);
  const results={};
  await Promise.all(selected.map(async name=>{
    const contextualHoldings=Array.isArray(requestContext?.portfolio?.ownerHoldings)?requestContext.portfolio.ownerHoldings:[];
    if(name==="holdings"&&(effectivePlan.filters?.owner||text(effectivePlan.groupBy).includes("owner")||text(effectivePlan.groupBy).includes("platform")||text(effectivePlan.groupBy).includes("broker"))){
      const needsCost=text(effectivePlan.metric)==="pnl_usd"||/\b(pnl|cost|costo|ganancia|p[eé]rdida)\b/.test(text(effectivePlan.metric));
      const custodyRows=contextualHoldings.filter(row=>matches(row,effectivePlan.filters));
      let rows=custodyRows;
      if(needsCost){
        const authoritativeHoldings=Array.isArray(requestContext?.portfolio?.holdings)?requestContext.portfolio.holdings:[];
        const authoritative=authoritativeHoldings.find(row=>matches(row,{ticker:effectivePlan.filters?.ticker,category:effectivePlan.filters?.category}));
        const custodyValue=custodyRows.reduce((sum,row)=>sum+Number(row.market_value_usd||row.valueUsd||0),0);
        const custodyQuantity=custodyRows.reduce((sum,row)=>sum+Number(row.quantity||0),0);
        const allocationBase=custodyValue>0?"value":"quantity";
        const allocationTotal=allocationBase==="value"?custodyValue:custodyQuantity;
        if(authoritative&&allocationTotal>0){
          rows=custodyRows.map(row=>{
            const basis=allocationBase==="value"?Number(row.market_value_usd||row.valueUsd||0):Number(row.quantity||0);
            const share=basis/allocationTotal;
            return{...row,
              quantity:Number(authoritative.quantity||0)*share,
              market_value_usd:Number(authoritative.valueUsd||0)*share,
              cost_value_usd:Number(authoritative.costUsd||0)*share,
              pnl_usd:Number(authoritative.pnlUsd||0)*share,
            };
          });
        }
      }
      results[name]=compact(rows);return
    }
    const limit=name==="movements"||name==="trading_trades"?1000:250;
    const rows=await runQuery(`SELECT * FROM ${table(DATASETS[name])} LIMIT ${limit}`);
    results[name]=compact(rows.filter(row=>matches(row,effectivePlan.filters)));
  }));
  results.computed_summary=summarizeResults(results);
  results.portfolio_total_usd=Number(requestContext?.portfolio?.portfolioTotal||0);
  const contextualHoldings=Array.isArray(requestContext?.portfolio?.ownerHoldings)?requestContext.portfolio.ownerHoldings:[];
  if(effectivePlan.filters?.owner){
    results.owner_total_usd=contextualHoldings
      .filter(row=>matches(row,{owner:effectivePlan.filters.owner}))
      .reduce((sum,row)=>sum+Number(row.market_value_usd||row.valueUsd||0),0);
  }
  if(effectivePlan.intent==="ratio"){
    const denominatorFilters=effectivePlan.denominatorFilters||{};
    const hasDenominatorScope=Object.values(denominatorFilters).some(value=>value!=null&&value!=="");
    results.ratio={
      numerator_usd:Number(results.computed_summary?.holdings?.market_value_usd||0),
      denominator_usd:hasDenominatorScope
        ?contextualHoldings.filter(row=>matches(row,denominatorFilters)).reduce((sum,row)=>sum+Number(row.market_value_usd||row.valueUsd||0),0)
        :Number(requestContext?.portfolio?.portfolioTotal||0),
    };
    results.ratio.percentage=results.ratio.denominator_usd
      ?results.ratio.numerator_usd/results.ratio.denominator_usd*100
      :null;
  }
  return results;
}

async function answerPlannedQuestion({messages,plan,data}){
  const question=lastQuestion(messages),response=await post({model:MODEL,reasoning:{effort:"low"},instructions:`Respondé en español rioplatense una pregunta factual sobre el portfolio usando exclusivamente DATA. Priorizá computed_summary, cuyos cálculos ya fueron realizados por el backend. Para distribuciones usá by_ticker, by_platform, by_owner o by_platform_owner según corresponda; si piden plataforma y titular juntos, no omitas ninguna de las dos dimensiones. Para intent=ratio usá exclusivamente DATA.ratio.percentage, cuyo numerador y denominador fueron calculados por el backend según los alcances declarados en el plan. Explicá brevemente ambos importes si ayuda a evitar ambigüedad. En preguntas de ganancia o pérdida actual, informá valor actual, costo y ganancia o pérdida; si está agrupado por titular, detallá los tres importes por cada titular que tenga una posición y el total. No inventes una fila en cero para un titular ausente: aclarale brevemente que no tiene una posición conciliada en ese activo. market_value, value_usd y market_value_usd son la misma valuación expresada en USD. Formateá moneda como US$ 99.129,89 y cantidades con un máximo razonable de decimales. Nunca muestres nombres técnicos como record_count, market_value_usd, quantity, DATA, filtros ni arrays JSON. No opines, no recomiendes, no completes datos ausentes y no menciones SQL ni implementación. Si record_count es cero, indicá que no se encontraron posiciones conciliadas para esos filtros. Respuesta natural, directa y compacta, en texto simple con saltos de línea. No uses Markdown: no escribas tablas, encabezados con #, asteriscos de negrita ni código.`,input:`PREGUNTA:\n${question}\n\nPLAN:\n${JSON.stringify(plan)}\n\nDATA:\n${JSON.stringify(data)}`,max_output_tokens:900,text:{verbosity:"low"},store:false});return{answer:outputText(response),usageStage:usageStage("data_answer",response)}
}

async function runPortfolioDataAgent(messages=[],requestContext={}){
  const planned=await planPortfolioQuestion(messages);
  const contextAliases=Array.isArray(requestContext?.portfolio?.custodyBrokerAliases)?requestContext.portfolio.custodyBrokerAliases:[];
  if(contextAliases.length){
    const fromQuestion=resolveCustodyBrokerAliasFromRows(lastQuestion(messages),contextAliases);
    if(fromQuestion!==lastQuestion(messages))planned.plan.filters.broker=fromQuestion;
  }
  if(planned.plan.route!=="PORTFOLIO_DATA")return{handled:false,plan:planned.plan,usageStages:[planned.usageStage]};
  const data=await executePlan(planned.plan,requestContext),answered=await answerPlannedQuestion({messages,plan:planned.plan,data});
  return{handled:true,answer:answered.answer,plan:planned.plan,dataSources:planned.plan.datasets,usageStages:[planned.usageStage,answered.usageStage]};
}

module.exports={executePlan,matches,normalizePlanTaxonomy,planPortfolioQuestion,resolveCustodyBrokerAliasFromRows,runPortfolioDataAgent};
