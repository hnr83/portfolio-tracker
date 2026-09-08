const crypto = require("crypto");
const bigquery = require("../config/bigQuery");
const { runQuery } = require("./bigQueryService");
const { table } = require("../utils/bigqueryHelper");
const { loadCurrentInvestmentPolicy } = require("./digitalTwinInvestmentPolicy");

const DECISIONS_TABLE = "digital_twin_decisions";
let readyPromise = null;

async function ensureDecisionTable(){
  if(!readyPromise) readyPromise=(async()=>{
    const dataset=bigquery.dataset(process.env.BIGQUERY_DATASET_ID),t=dataset.table(DECISIONS_TABLE);
    const [exists]=await t.exists();
    if(!exists) await dataset.createTable(DECISIONS_TABLE,{schema:[
      {name:"id",type:"STRING",mode:"REQUIRED"},{name:"question",type:"STRING"},{name:"answer",type:"STRING"},
      {name:"pipeline",type:"STRING"},{name:"model",type:"STRING"},{name:"policy_snapshot_json",type:"STRING"},
      {name:"portfolio_snapshot_json",type:"STRING"},{name:"planner_snapshot_json",type:"STRING"},{name:"created_at",type:"TIMESTAMP"}
    ]});
  })().catch(e=>{readyPromise=null;throw e});
  return readyPromise;
}

async function persistDecision({messages=[],result,context,currentInvestmentPolicy=[]}){
  if(!result?.answer || result?.pipeline==="policy_intent_only") return;
  await ensureDecisionTable();
  const lastUser=[...messages].reverse().find(m=>m?.role==="user");
  await runQuery(`INSERT INTO ${table(DECISIONS_TABLE)} (id,question,answer,pipeline,model,policy_snapshot_json,portfolio_snapshot_json,planner_snapshot_json,created_at) VALUES(@id,@question,@answer,@pipeline,@model,@policy,@portfolio,@planner,CURRENT_TIMESTAMP())`,{
    id:crypto.randomUUID(),question:String(lastUser?.content||"").slice(0,8000),answer:String(result.answer||"").slice(0,30000),
    pipeline:String(result.pipeline||""),model:String(result.model||""),policy:JSON.stringify(currentInvestmentPolicy||[]),
    portfolio:JSON.stringify(context?.portfolio||null),planner:JSON.stringify(context?.planner||null)
  });
}

async function getTwinState(req,res){try{
  const currentInvestmentPolicy=await loadCurrentInvestmentPolicy();
  return res.json({currentInvestmentPolicy});
}catch(e){console.error("Twin state failed:",{message:e?.message,code:e?.code});return res.status(500).json({error:"Error loading Twin state"})}}

async function getTwinTracking(req,res){try{
  await ensureDecisionTable();
  const [policies,decisions]=await Promise.all([
    runQuery(`SELECT id,asset,strategy,amount_usd,frequency,status,source,source_message,created_at FROM ${table("digital_twin_investment_policy")} ORDER BY created_at DESC LIMIT 100`),
    runQuery(`SELECT id,question,answer,pipeline,model,created_at FROM ${table(DECISIONS_TABLE)} ORDER BY created_at DESC LIMIT 50`)
  ]);
  const items=[
    ...policies.map(x=>({id:x.id,type:"policy",asset:x.asset,strategy:x.strategy,amountUsd:x.amount_usd==null?null:Number(x.amount_usd),frequency:x.frequency,status:x.status,sourceMessage:x.source_message,createdAt:x.created_at?.value||x.created_at})),
    ...decisions.map(x=>({id:x.id,type:"decision",question:x.question,answer:x.answer,pipeline:x.pipeline,model:x.model,createdAt:x.created_at?.value||x.created_at}))
  ].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return res.json({items});
}catch(e){console.error("Twin tracking failed:",{message:e?.message,code:e?.code});return res.status(500).json({error:"Error loading Twin tracking"})}}

module.exports={persistDecision,getTwinState,getTwinTracking};
