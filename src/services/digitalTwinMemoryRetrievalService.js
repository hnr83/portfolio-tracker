const axios = require("axios");
const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MEMORY_MODEL = process.env.DIGITAL_TWIN_MEMORY_MODEL || process.env.DIGITAL_TWIN_RESEARCH_MODEL || process.env.DIGITAL_TWIN_MODEL || "gpt-5-mini";
const MAX_DB_CANDIDATES = 30;
const MAX_SELECTOR_CANDIDATES = 8;
const MAX_SELECTED = 3;
const STOP = new Set(["para","como","pero","porque","esto","esta","este","estos","estas","sobre","desde","hasta","entre","tiene","tengo","tener","hoy","ahora","actual","actualmente","quiero","conviene","deberia","debería","puede","puedo","ser","una","uno","unos","unas","del","las","los","que","con","sin","por","más","mas","muy","mis","mi","tu","twin","decision","decisión"]);

function outputText(response) {
  if (response?.output_text) return response.output_text;
  const parts=[];
  for(const item of response?.output||[]) for(const content of item?.content||[]) if(content?.type==="output_text"&&content?.text) parts.push(content.text);
  return parts.join("\n").trim();
}
function parseJson(text){return JSON.parse(String(text||"").trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim())}
function normalizeText(value=""){return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9$]+/g," ").trim()}
function tokens(value=""){return new Set(normalizeText(value).split(/\s+/).filter(x=>x.length>=3&&!STOP.has(x)))}
function scoreCandidate(question,row){
  const q=tokens(question),t=tokens(`${row.question||""} ${row.answer||""}`);let overlap=0;
  for(const x of q) if(t.has(x)) overlap+=1;
  const qUpper=String(question||"").toUpperCase(), textUpper=`${row.question||""} ${row.answer||""}`.toUpperCase();
  const assetHits=(qUpper.match(/\b[A-Z]{2,6}\b/g)||[]).filter(x=>textUpper.includes(x)).length;
  const ageDays=Math.max(0,(Date.now()-new Date(row.created_at?.value||row.created_at||0).getTime())/86400000);
  const recency=Math.max(0,1-Math.min(ageDays,180)/180);
  return overlap*3+assetHits*5+recency;
}
function compactCandidate(row){return{id:String(row.id),question:String(row.question||"").slice(0,900),answer:String(row.answer||"").slice(0,1800),createdAt:row.created_at?.value||row.created_at||null}}

const SELECTION_SCHEMA={type:"object",additionalProperties:false,properties:{selected:{type:"array",maxItems:MAX_SELECTED,items:{type:"object",additionalProperties:false,properties:{id:{type:"string"},reason:{type:"string"}},required:["id","reason"]}},noneRelevant:{type:"boolean"}},required:["selected","noneRelevant"]};

async function loadCandidates(question){
  const rows=await runQuery(`SELECT id,question,answer,created_at FROM ${table("digital_twin_decisions")} ORDER BY created_at DESC LIMIT ${MAX_DB_CANDIDATES}`);
  return rows.map(row=>({...row,_score:scoreCandidate(question,row)})).sort((a,b)=>b._score-a._score).slice(0,MAX_SELECTOR_CANDIDATES);
}

async function selectRelevantDecisionMemory({messages=[],context={},currentProfile={}}={}){
  const lastUser=[...messages].reverse().find(m=>m?.role==="user");
  const question=String(lastUser?.content||"").trim();
  if(!question)return{items:[],usageStage:null,candidateCount:0};
  let candidates=[];
  try{candidates=await loadCandidates(question)}catch(error){
    if(String(error?.message||"").includes("Not found")) return{items:[],usageStage:null,candidateCount:0};
    console.warn("Twin memory candidates unavailable",{message:error?.message,code:error?.code});
    return{items:[],usageStage:null,candidateCount:0};
  }
  if(!candidates.length)return{items:[],usageStage:null,candidateCount:0};

  const candidatePayload=candidates.map(compactCandidate);
  const profileSummary={style:currentProfile?.style,implementation_style:currentProfile?.implementation_style,concentration_tolerance:currentProfile?.concentration_tolerance};
  const operational=(context?.currentInvestmentPolicy?.policies||[]).map(p=>({asset:p.asset,strategy:p.strategy,amountUsd:p.amountUsd??p.amount_usd,frequency:p.frequency,status:p.status}));
  const body={
    model:MEMORY_MODEL,
    reasoning:{effort:"low"},
    instructions:`Seleccioná como máximo ${MAX_SELECTED} decisiones históricas que sean MATERIALMENTE relevantes para responder la consulta actual. Una decisión pasada es antecedente, no preferencia permanente ni política vigente. No la selecciones sólo porque comparte palabras genéricas. Priorizá mismo activo, misma decisión económica, misma tesis o una comparación previa que cambie cómo interpretar la consulta. Si ninguna agrega continuidad real, devolvé selected=[] y noneRelevant=true. No respondas la consulta.`,
    input:`Consulta actual: ${question.slice(0,1800)}\nPerfil resumido: ${JSON.stringify(profileSummary)}\nPolítica operativa actual: ${JSON.stringify(operational)}\nCandidatos históricos: ${JSON.stringify(candidatePayload)}`,
    max_output_tokens:900,
    text:{verbosity:"low",format:{type:"json_schema",name:"twin_memory_selection",strict:true,schema:SELECTION_SCHEMA}},
    store:false
  };
  let data;
  try{
    data=(await axios.post(OPENAI_RESPONSES_URL,body,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},timeout:60000})).data;
    const parsed=parseJson(outputText(data));
    const byId=new Map(candidatePayload.map(x=>[x.id,x]));
    const selected=[];
    for(const pick of parsed.selected||[]){const row=byId.get(String(pick.id));if(!row||selected.some(x=>x.id===row.id))continue;selected.push({...row,relevanceReason:String(pick.reason||"").slice(0,300)});if(selected.length>=MAX_SELECTED)break;}
    return{items:selected,candidateCount:candidates.length,usageStage:{stage:"memory_retrieval",model:data?.model||MEMORY_MODEL,apiRequests:1,webSearchCalls:0,usage:data?.usage||null}};
  }catch(error){
    console.warn("Twin selective memory retrieval unavailable; continuing without history",{message:error?.message,status:error?.response?.status});
    return{items:[],candidateCount:candidates.length,usageStage:data?{stage:"memory_retrieval",model:data?.model||MEMORY_MODEL,apiRequests:1,webSearchCalls:0,usage:data?.usage||null}:null};
  }
}

module.exports={selectRelevantDecisionMemory};
