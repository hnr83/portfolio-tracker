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
const PLAN_SCHEMA={type:"object",additionalProperties:false,properties:{route:{type:"string",enum:["PORTFOLIO_DATA","TWIN_ANALYSIS"]},datasets:{type:"array",maxItems:3,items:{type:"string",enum:Object.keys(DATASETS)}},filters:{type:"object",additionalProperties:false,properties:{ticker:{type:["string","null"]},owner:{type:["string","null"]},broker:{type:["string","null"]},category:{type:["string","null"]},side:{type:["string","null"]},dateFrom:{type:["string","null"]},dateTo:{type:["string","null"]}},required:["ticker","owner","broker","category","side","dateFrom","dateTo"]},calculation:{type:"string",enum:["summary","list","count","sum","compare","group"]},metric:{type:["string","null"]},groupBy:{type:["string","null"]},reason:{type:"string"}},required:["route","datasets","filters","calculation","metric","groupBy","reason"]};

function outputText(response){if(response?.output_text)return response.output_text;const parts=[];for(const item of response?.output||[])for(const content of item?.content||[])if(content?.type==="output_text"&&content?.text)parts.push(content.text);return parts.join("\n").trim()}
function parseJson(text){return JSON.parse(String(text||"").trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}
async function post(body){if(!process.env.OPENAI_API_KEY){const error=new Error("OPENAI_API_KEY is not configured");error.code="OPENAI_NOT_CONFIGURED";throw error}return(await axios.post(OPENAI_RESPONSES_URL,body,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},timeout:60000})).data}
function usageStage(stage,data){return{stage,model:data?.model||MODEL,apiRequests:1,webSearchCalls:0,usage:data?.usage||null}}
function lastQuestion(messages=[]){return String([...messages].reverse().find(x=>x?.role==="user")?.content||"").trim()}
function normalizePlanTaxonomy(plan={},question=""){
  const normalized={...plan,filters:{...(plan.filters||{})}};
  const q=text(question);
  if(/\bcriptomonedas?\b/.test(q))normalized.filters.category="cryptocurrency";
  else if(/\b(crypto|cripto)\b/.test(q))normalized.filters.category="crypto";
  return normalized;
}

async function planPortfolioQuestion(messages=[]){
  const question=lastQuestion(messages),data=await post({model:MODEL,reasoning:{effort:"low"},instructions:`Clasificá una pregunta para una app personal de inversiones. PORTFOLIO_DATA si puede responderse exclusivamente con datos propios: holdings, movimientos, titulares, brokers/plataformas, aportes, compras/ventas, PnL/performance histórica o trading. TWIN_ANALYSIS si pide opinión, recomendación, explicación causal, patrones, riesgo cualitativo o qué debería hacer. Taxonomía propia: "crypto" es la categoría CRYPTO de dólares digitales (USDT). BTC, ETH, SOL y RON son criptomonedas económicas pero están registrados como category=PORTFOLIO e instrument_type=ASSET; para preguntas que digan "criptomonedas" usá category=cryptocurrency, y para una moneda concreta usá ticker. Para distribución por broker/plataforma usá holdings y agrupá por broker. Elegí sólo los datasets mínimos. metric y groupBy deben ser nombres conceptuales breves; nunca generes SQL. Fechas en YYYY-MM-DD; resolvé referencias como "agosto" usando fecha actual ${new Date().toISOString().slice(0,10)}.`,input:question,max_output_tokens:700,text:{verbosity:"low",format:{type:"json_schema",name:"portfolio_query_plan",strict:true,schema:PLAN_SCHEMA}},store:false});
  return{plan:normalizePlanTaxonomy(parseJson(outputText(data)),question),usageStage:usageStage("data_planner",data)};
}

function value(row,...keys){for(const key of keys)if(row?.[key]!=null)return row[key];return null}
function text(value){return String(value??"").trim().toLowerCase()}
function ownerText(value){const normalized=text(value);return normalized==="vale"?"valeria":normalized}
function rowDate(row){const raw=value(row,"fecha","date","created_at","closed_at","opened_at");return String(raw?.value||raw||"").slice(0,10)}
function matches(row,filters={}){
  const ticker=text(value(row,"normalized_ticker","ticker","instrument","asset","underlying_ticker"));
  if(filters.ticker&&!ticker.includes(text(filters.ticker)))return false;
  if(filters.owner&&ownerText(value(row,"owner","titular"))!==ownerText(filters.owner))return false;
  if(filters.broker&&text(value(row,"broker","platform","exchange"))!==text(filters.broker))return false;
  if(filters.category){const requested=text(filters.category),category=text(value(row,"category","asset_class")),economicTicker=ticker.replace(/^currency:|ars$|usd$/g,""),isCryptocurrency=["btc","eth","sol","ron"].includes(economicTicker);if(requested==="crypto"||requested==="cripto"){if(category!=="crypto")return false}else if(requested==="cryptocurrency"||requested==="criptomoneda"||requested==="criptomonedas"){if(!isCryptocurrency)return false}else if(category!==requested)return false}
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
function compact(rows=[]){return rows.slice(0,250).map(row=>Object.fromEntries(Object.entries(row).map(([key,val])=>[key,scalar(val)]).filter(([,val])=>val!=null).slice(0,24)))}

async function executePlan(plan={},requestContext={}){
  const selected=(plan.datasets||[]).filter(name=>DATASETS[name]).slice(0,3);
  const results={};
  await Promise.all(selected.map(async name=>{
    const contextualHoldings=Array.isArray(requestContext?.portfolio?.ownerHoldings)?requestContext.portfolio.ownerHoldings:[];
    if(name==="holdings"&&contextualHoldings.length){results[name]=compact(contextualHoldings.filter(row=>matches(row,plan.filters)));return}
    const limit=name==="movements"||name==="trading_trades"?1000:250;
    const rows=await runQuery(`SELECT * FROM ${table(DATASETS[name])} LIMIT ${limit}`);
    results[name]=compact(rows.filter(row=>matches(row,plan.filters)));
  }));
  return results;
}

async function answerPlannedQuestion({messages,plan,data}){
  const question=lastQuestion(messages),response=await post({model:MODEL,reasoning:{effort:"low"},instructions:`Respondé en español rioplatense una pregunta factual sobre el portfolio usando exclusivamente DATA. Hacé los cálculos solicitados con los campos disponibles. No opines, no recomiendes, no completes datos ausentes y no menciones SQL ni implementación. Si no alcanza, explicá exactamente qué dato falta. Respuesta directa y compacta.`,input:`PREGUNTA:\n${question}\n\nPLAN:\n${JSON.stringify(plan)}\n\nDATA:\n${JSON.stringify(data)}`,max_output_tokens:900,text:{verbosity:"low"},store:false});return{answer:outputText(response),usageStage:usageStage("data_answer",response)}
}

async function runPortfolioDataAgent(messages=[],requestContext={}){const planned=await planPortfolioQuestion(messages);if(planned.plan.route!=="PORTFOLIO_DATA")return{handled:false,plan:planned.plan,usageStages:[planned.usageStage]};const data=await executePlan(planned.plan,requestContext),answered=await answerPlannedQuestion({messages,plan:planned.plan,data});return{handled:true,answer:answered.answer,plan:planned.plan,dataSources:planned.plan.datasets,usageStages:[planned.usageStage,answered.usageStage]}}

module.exports={executePlan,matches,normalizePlanTaxonomy,planPortfolioQuestion,runPortfolioDataAgent};
