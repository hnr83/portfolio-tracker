const axios = require("axios");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const WEB_TOOLS = [{ type: "web_search" }];
const RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RESEARCH_ASSETS = 3;
const MAX_SCREENED_ASSETS = 20;
const researchCache = new Map();

function outputText(response) {
  if (response?.output_text) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && content?.text) parts.push(content.text);
  }
  return parts.join("\n").trim();
}
function parseJson(text) { return JSON.parse(String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }
function truncated(data) { return data?.status === "incomplete" || data?.incomplete_details?.reason === "max_output_tokens"; }
function mergeUsage(...items) {
  const valid = items.filter(Boolean); if (!valid.length) return null;
  const sum = key => valid.reduce((a, x) => a + (Number(x?.[key]) || 0), 0);
  return { input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), total_tokens: sum("total_tokens"),
    input_tokens_details: { cached_tokens: valid.reduce((a,x)=>a+(Number(x?.input_tokens_details?.cached_tokens)||0),0) },
    output_tokens_details: { reasoning_tokens: valid.reduce((a,x)=>a+(Number(x?.output_tokens_details?.reasoning_tokens)||0),0) } };
}
function summarizeTools(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  return { webSearchCalls: output.filter(x => x?.type === "web_search_call").length, outputTypes: output.map(x => x?.type).filter(Boolean) };
}
function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0,500)}…` : value;
  if (typeof value !== "object") return value;
  if (depth >= 3) return Array.isArray(value) ? `[${value.length} items]` : "[object omitted]";
  if (Array.isArray(value)) return value.slice(0,10).map(v => compact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, compact(v, depth + 1)]));
}
function compactProfile(profile = {}) {
  return compact({ investor_narrative: profile.investor_narrative, style: profile.style, concentration_tolerance: profile.concentration_tolerance,
    drawdown_tolerance: profile.drawdown_tolerance, liquidity_preference: profile.liquidity_preference,
    implementation_style: profile.implementation_style, convictions: profile.convictions, rules: profile.rules });
}
function portfolioRows(context = {}) {
  const p = context?.portfolio || {};
  if (Array.isArray(p.exposures) && p.exposures.length) return p.exposures;
  if (Array.isArray(p.topExposures) && p.topExposures.length) return p.topExposures;
  return [];
}
function assetId(row = {}) { return String(row?.ticker || row?.asset || row?.symbol || row?.name || "").trim(); }
function firstFinite(...values) {
  for (const value of values) { const n = Number(value); if (Number.isFinite(n)) return n; }
  return null;
}
function portfolioUniverse(context = {}) {
  const seen = new Set(); const rows = [];
  for (const row of portfolioRows(context)) {
    const asset = assetId(row); if (!asset) continue;
    const key = asset.toUpperCase(); if (seen.has(key)) continue; seen.add(key);
    const item = { asset };
    const weightPct = firstFinite(row?.weightPct,row?.weight_pct,row?.portfolioWeightPct,row?.portfolio_weight_pct,row?.weight);
    const valueUsd = firstFinite(row?.valueUsd,row?.value_usd,row?.marketValueUsd,row?.market_value_usd,row?.marketValue,row?.market_value);
    const category = row?.category || row?.assetClass || row?.asset_class || row?.type || null;
    if (weightPct != null) item.weightPct = weightPct; if (valueUsd != null) item.valueUsd = valueUsd; if (category) item.category = String(category).slice(0,80);
    rows.push(item);
  }
  return rows;
}
function portfolioAssetIds(context = {}) { return portfolioUniverse(context).map(x => x.asset); }
function compactDecisionContext(context = {}) {
  const p = context?.portfolio || {}; const planner = context?.planner || {};
  return compact({ portfolio: { totalValueUsd: p.totalValueUsd, cryptoExposurePct: p.cryptoExposurePct, liquidityPct: p.liquidityPct,
    topExposures: p.topExposures || p.exposures }, planner: { scenarioName: planner.scenarioName, horizonYears: planner.horizonYears,
    expectedReturnPct: planner.expectedReturnPct, fireGoalUsd: planner.fireGoalUsd } });
}
function userText(messages = []) { return (messages || []).filter(m=>m?.role==="user").map(m=>String(m.content||"")).join("\n"); }
function looksLikeOpenAllocation(messages = []) {
  const text = userText(messages).toLowerCase();
  return /(ahorro|aporte|disponible|invertir|invierto|inversi[oó]n).*(mes|aporte|cartera|asignaci[oó]n)|asignaci[oó]n.*(aporte|ahorro|mes)/i.test(text);
}
function explicitUsdAmount(messages = []) {
  const users = (messages || []).filter(m=>m?.role==="user");
  for (let i=users.length-1;i>=0;i--) {
    const raw=String(users[i]?.content||""); const match=raw.match(/(?:us\$|usd|u\$s|d[oó]lares?)\s*([\d.,]+)|([\d.,]+)\s*(?:us\$|usd|u\$s|d[oó]lares?)/i);
    if (match) { const value=Number(String(match[1]||match[2]).replace(/\./g,"").replace(",",".")); if (Number.isFinite(value)&&value>0) return value; }
  }
  const last=String(users.at(-1)?.content||"").trim();
  if (users.length>1 && /^\$?\s*[\d.,]+\s*$/.test(last)) { const value=Number(last.replace("$","").trim().replace(/\./g,"").replace(",",".")); if(Number.isFinite(value)&&value>0)return value; }
  return null;
}
async function post(body, timeout=120000) { return (await axios.post(OPENAI_RESPONSES_URL,body,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},timeout})).data; }

const SCREEN_ITEM={type:"object",additionalProperties:false,properties:{asset:{type:"string"},status:{type:"string",enum:["research_now","defer"]},reason:{type:"string"}},required:["asset","status","reason"]};
const PREFLIGHT_SCHEMA={type:"object",additionalProperties:false,properties:{decisionType:{type:"string",enum:["allocation","asset_question","portfolio_risk","sell_hold","plan_progress","other"]},screenedAssets:{type:"array",maxItems:MAX_SCREENED_ASSETS,items:SCREEN_ITEM},researchAssets:{type:"array",maxItems:MAX_RESEARCH_ASSETS,items:{type:"string"}},researchQuestion:{type:"string"}},required:["decisionType","screenedAssets","researchAssets","researchQuestion"]};
const EVIDENCE_ITEM={type:"object",additionalProperties:false,properties:{asset:{type:"string"},thesis:{type:"string",enum:["stronger","intact","mixed","weaker","unknown"]},valuation:{type:"string",enum:["attractive","neutral","stretched","unknown"]},keyFacts:{type:"array",maxItems:3,items:{type:"string"}},quality:{type:"string",enum:["high","medium","low"]},limitation:{type:"string"}},required:["asset","thesis","valuation","keyFacts","quality","limitation"]};
const RESEARCH_SCHEMA={type:"object",additionalProperties:false,properties:{assets:{type:"array",maxItems:MAX_RESEARCH_ASSETS,items:EVIDENCE_ITEM},limitation:{type:"string"}},required:["assets","limitation"]};

function normalizeResearchAssets(assets=[],context={}) {
  const ids=portfolioAssetIds(context); const canonical=new Map(ids.map(id=>[id.toUpperCase(),id])); const out=[]; const seen=new Set();
  for(const raw of assets||[]){const key=String(raw||"").trim().toUpperCase();const match=canonical.get(key);if(!match||seen.has(key))continue;seen.add(key);out.push(match);if(out.length>=MAX_RESEARCH_ASSETS)break;} return out;
}
function normalizeScreening(screenedAssets=[],context={}) {
  const ids=portfolioAssetIds(context);const canonical=new Map(ids.map(id=>[id.toUpperCase(),id]));const byAsset=new Map();
  for(const item of screenedAssets||[]){const key=String(item?.asset||"").trim().toUpperCase();const asset=canonical.get(key);if(!asset||byAsset.has(key))continue;byAsset.set(key,{asset,status:item?.status==="research_now"?"research_now":"defer",reason:String(item?.reason||"").slice(0,220)});} return ids.map(asset=>byAsset.get(asset.toUpperCase())).filter(Boolean);
}
function fallbackAssets(context={}) { return portfolioAssetIds(context).slice(0,MAX_RESEARCH_ASSETS); }
async function runPreflight({messages,context,currentProfile,amount}) {
  const recent=(messages||[]).slice(-3).map(m=>`${m.role}: ${String(m.content||"").slice(0,700)}`).join("\n"); const universe=portfolioUniverse(context);
  const input=`Monto: ${amount==null?"no informado":`USD ${amount}`}\nPerfil: ${JSON.stringify(compactProfile(currentProfile))}\nCartera/plan agregado: ${JSON.stringify(compactDecisionContext(context))}\nUNIVERSO COMPLETO DE CARTERA (screening obligatorio, ${universe.length} activos): ${JSON.stringify(universe)}\nConsulta: ${recent}`;
  const body={model:DEFAULT_MODEL,reasoning:{effort:"low"},instructions:`Planificá la decisión, sin responderla ni investigar. Hacé un screening EXPLÍCITO de TODOS los activos del universo. screenedAssets debe contener exactamente un registro por activo, con research_now o defer y razón breve basada sólo en cartera, consulta e Investor Model; no inventes fundamentales actuales. Elegí máximo ${MAX_RESEARCH_ASSETS} activos actuales para research profundo y sólo entre research_now. No propongas externos. Screening no es ranking ni evaluación fundamental. IMPORTANTE: peso, valor, tamaño o ser una posición principal son ESTADO ACTUAL, no evidencia de atractivo ni preferencia; sólo pueden justificar que un activo sea material para revisar, nunca que sea mejor/peor compra. La razón de research_now/defer debe expresar relevancia para investigar, no atractivo esperado. Planner no es target.`,input,max_output_tokens:1600,text:{verbosity:"low",format:{type:"json_schema",name:"twin_preflight",strict:true,schema:PREFLIGHT_SCHEMA}},store:false};
  let data;
  try { data=await post(body,60000); if(truncated(data))throw new Error("PREFLIGHT_TRUNCATED"); const parsed=parseJson(outputText(data)); const screenedAssets=normalizeScreening(parsed.screenedAssets,context); const screeningComplete=screenedAssets.length===universe.length; let researchAssets=normalizeResearchAssets(parsed.researchAssets,context); const marked=new Set(screenedAssets.filter(x=>x.status==="research_now").map(x=>x.asset.toUpperCase())); researchAssets=researchAssets.filter(asset=>marked.has(asset.toUpperCase())); if(!researchAssets.length&&screeningComplete)researchAssets=screenedAssets.filter(x=>x.status==="research_now").map(x=>x.asset).slice(0,MAX_RESEARCH_ASSETS);if(!researchAssets.length)researchAssets=fallbackAssets(context);return{plan:{...parsed,screenedAssets,screeningComplete,researchAssets,portfolioUniverseAssets:portfolioAssetIds(context),screenedPortfolioCount:screenedAssets.length,allocationAmountUsd:amount},attempts:[data]}; }
  catch(error){console.warn("Digital Twin preflight unavailable; using deterministic fallback",{message:error?.message,usage:data?.usage});return{plan:{decisionType:looksLikeOpenAllocation(messages)?"allocation":"other",screenedAssets:[],screeningComplete:false,researchAssets:fallbackAssets(context),researchQuestion:"Comparar tesis/fundamentales y valuación actual con evidencia reciente.",portfolioUniverseAssets:portfolioAssetIds(context),screenedPortfolioCount:0,allocationAmountUsd:amount,preflightFallback:true},attempts:data?[data]:[]};}
}
function cacheKey(asset){return String(asset||"").trim().toUpperCase();}
function getCached(asset){const item=researchCache.get(cacheKey(asset));if(!item)return null;if(Date.now()-item.fetchedAt>RESEARCH_CACHE_TTL_MS){researchCache.delete(cacheKey(asset));return null;}return item.evidence;}
function putCached(evidence){if(cacheKey(evidence?.asset))researchCache.set(cacheKey(evidence.asset),{evidence,fetchedAt:Date.now()});}
async function researchBatch(plan){
  const requested=(plan?.researchAssets||[]).slice(0,MAX_RESEARCH_ASSETS);const cached=requested.map(getCached).filter(Boolean);const missing=requested.filter(asset=>!getCached(asset));if(!missing.length)return{matrix:{assets:cached,limitation:"",requestedAssets:requested,cacheHits:cached.map(x=>x.asset)},attempts:[],tools:{webSearchCalls:0,outputTypes:[]}};
  const body={model:DEFAULT_MODEL,reasoning:{effort:"low"},instructions:`Investigá sólo estos activos de la cartera: ${missing.join(", ")}. Una única pasada de web search. No recomiendes ni asignes capital. Para cada activo devolvé estado de tesis, valuación actual, máximo 3 hechos discriminantes, calidad y limitación. Compacto; fuentes primarias/financieras sólidas. ATH/distancia no prueba baratura. Para acciones preferí múltiplos, crecimiento, FCF/márgenes/expectativas. Si no alcanza evidencia, unknown. No inventes probabilidades, escenarios ni métricas.`,input:`Pregunta comparativa: ${String(plan?.researchQuestion||"").slice(0,700)}`,tools:WEB_TOOLS,tool_choice:"auto",max_output_tokens:1800,text:{verbosity:"low",format:{type:"json_schema",name:"twin_compact_research",strict:true,schema:RESEARCH_SCHEMA}},store:false};
  let data;try{data=await post(body,120000);if(truncated(data))throw new Error("RESEARCH_TRUNCATED");const parsed=parseJson(outputText(data));const allowed=new Set(requested.map(cacheKey));const safeAssets=(parsed.assets||[]).filter(item=>allowed.has(cacheKey(item?.asset)));safeAssets.forEach(putCached);const covered=new Set([...cached,...safeAssets].map(x=>cacheKey(x?.asset)));const uncoveredAssets=requested.filter(asset=>!covered.has(cacheKey(asset)));return{matrix:{assets:[...cached,...safeAssets],limitation:parsed.limitation||"",requestedAssets:requested,uncoveredAssets,cacheHits:cached.map(x=>x.asset)},attempts:[data],tools:summarizeTools(data)};}catch(error){console.warn("Digital Twin compact research unavailable; continuing without inventing evidence",{message:error?.message,status:data?.status,reason:data?.incomplete_details?.reason,usage:data?.usage});return{matrix:{assets:cached,limitation:"La investigación externa quedó incompleta. No hay evidencia nueva suficiente para desempatar activos no cubiertos.",requestedAssets:requested,uncoveredAssets:missing,cacheHits:cached.map(x=>x.asset)},attempts:data?[data]:[],tools:data?summarizeTools(data):{webSearchCalls:0,outputTypes:[]}};}
}
async function draftDecision({plan,matrix,currentProfile,context,messages}){
  const recent=(messages||[]).slice(-3).map(m=>`${m.role}: ${String(m.content||"").slice(0,900)}`).join("\n");const universe=portfolioUniverse(context);const compactPlan=compact({decisionType:plan?.decisionType,allocationAmountUsd:plan?.allocationAmountUsd,screenedAssets:plan?.screenedAssets,screeningComplete:plan?.screeningComplete,researchAssets:plan?.researchAssets,researchQuestion:plan?.researchQuestion,screenedPortfolioCount:plan?.screenedPortfolioCount});
  const input=`Perfil: ${JSON.stringify(compactProfile(currentProfile))}\nContexto agregado: ${JSON.stringify(compactDecisionContext(context))}\nUNIVERSO COMPLETO DE CARTERA: ${JSON.stringify(universe)}\nSCREENING TRAZABLE: ${JSON.stringify(plan?.screenedAssets||[])}\nPlan: ${JSON.stringify(compactPlan)}\nEvidencia profunda: ${JSON.stringify(matrix)}\nConsulta: ${recent}`;
  const data=await post({model:DEFAULT_MODEL,reasoning:{effort:"medium"},instructions:`Sos el Digital Investment Twin. Respondé desde Investor Model, datos determinísticos y evidencia explícita. Aplicá estas INVARIANTES GENERALES, no reglas ad-hoc por activo:
1) ESTADO != ATRACTIVO: peso/tamaño/performance/ser posición principal describe estado. No puede justificar comprar/vender ni desempatar salvo que la consulta sea explícitamente sobre exposición/riesgo.
2) FUERZA DE CONCLUSIÓN <= FUERZA DEL PUENTE: podés tomar posición y proponer porcentajes como JUICIO TÁCTICO, pero cuanto más extrema sea la diferencia entre asignaciones, más explícito y fuerte debe ser el puente comparativo soportado. Si la evidencia sólo inclina levemente, no presentes una diferencia extrema como convicción derivada de ella.
3) DECISIÓN PUNTUAL != REGLA FUTURA: una asignación de este aporte no crea automáticamente una proporción para próximos meses, frecuencia DCA, tramos, timing ni política persistente. Sólo Investor Model/regla explícita puede hacerlo.
4) CONTEXTO CONOCIDO NO SE PIDE: no solicites al usuario un dato que ya aparezca en Perfil, Contexto, Universo, Screening, Plan o Evidencia. Si podés calcular algo con esos datos, no digas que necesitás que el usuario te lo dé.
5) COBERTURA != SEÑAL: shortlist/research_now sólo indica dónde profundizaste; uncovered/defer no es inferior.
6) PROVENIENCIA: números factuales/forecast/métricas deben existir explícitamente en inputs. Asignaciones nuevas son juicio táctico, no hechos.
El screening debe ser completo para afirmarlo y no equivale a research fundamental. No externos. Diversificación/concentración/ATH no prueban atractivo. Planner no es target. Para allocation: conclusión, screening, research, comparación con incertidumbre proporcional, propuesta accionable y qué cambiaría la decisión. No inventes implementación operativa. Español rioplatense, directo, máximo 450 palabras.`,input,max_output_tokens:2800,text:{verbosity:"low"},store:false},120000);
  let answer=outputText(data);if(!answer&&truncated(data))answer="La evidencia actual no alcanza para justificar una asignación precisa sin inventar supuestos. La cartera completa fue considerada para el screening, pero el research profundo no alcanza para fabricar un ganador.";if(!answer)throw new Error("Digital Twin returned an empty decision response");return{answer,attempts:[data],data};
}
async function runDecisionPipeline({messages=[],context={},currentProfile={}}){
  if(!process.env.OPENAI_API_KEY){const error=new Error("OPENAI_API_KEY is not configured");error.code="OPENAI_NOT_CONFIGURED";throw error;}const openAllocation=looksLikeOpenAllocation(messages);const amount=openAllocation?explicitUsdAmount(messages):null;if(openAllocation&&amount==null)return{answer:"¿Cuánto tenés disponible para invertir este mes?",preflight:{decisionType:"allocation",researchAssets:[],allocationAmountUsd:null},evidenceMatrix:null,usage:null,apiRequests:0,model:DEFAULT_MODEL,responseId:null,tools:{webSearchCalls:0,outputTypes:[]}};
  const{plan,attempts:preflightAttempts}=await runPreflight({messages,context,currentProfile,amount});const research=await researchBatch(plan);const drafted=await draftDecision({plan,matrix:research.matrix,currentProfile,context,messages});const allAttempts=[...preflightAttempts,...research.attempts,...drafted.attempts];return{answer:drafted.answer,preflight:plan,evidenceMatrix:research.matrix,usage:mergeUsage(...allAttempts.map(a=>a?.usage)),apiRequests:allAttempts.length,model:drafted.data?.model||DEFAULT_MODEL,responseId:drafted.data?.id||null,tools:research.tools};
}
module.exports={runDecisionPipeline};
