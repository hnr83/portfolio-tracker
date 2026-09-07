import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatPortfolioPercent } from "../../utils/formatters";
import { apiFetch } from "../../utils/api";
import InvestorModelPanel from "./digital-twin/InvestorModelPanel";

const REFERENCE_SCENARIO_KEY = "digital-twin-reference-scenario-id";
const KNOWN_CRYPTO_TICKERS = new Set(["BTC", "ETH", "SOL", "RON"]);

function tickerOf(row) {
  return String(row?.normalized_ticker || row?.ticker || "").toUpperCase().trim();
}

function economicExposureTicker(row) {
  const underlying = String(row?.underlying_ticker || "").toUpperCase().trim();
  if (underlying) return underlying.replace(/^(BCBA|BATS):/, "");
  return tickerOf(row).replace(/^(BCBA|BATS):/, "");
}

function pct(part, total) {
  if (!total) return 0;
  return (Number(part || 0) / Number(total || 0)) * 100;
}

function parseAssets(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cryptoValueFromInvestments(investments) {
  return investments
    .filter((row) => KNOWN_CRYPTO_TICKERS.has(economicExposureTicker(row)))
    .reduce((sum, row) => sum + Number(row?.market_value_usd || 0), 0);
}

function buildEconomicExposures(investments, portfolioTotal) {
  const grouped = new Map();
  investments.forEach((item) => {
    const exposure = economicExposureTicker(item);
    const instrument = tickerOf(item);
    const value = Number(item.market_value_usd || 0);
    if (!exposure || !Number.isFinite(value) || value <= 0) return;
    const current = grouped.get(exposure) || { ticker: exposure, value: 0, instruments: new Set() };
    current.value += value;
    if (instrument) current.instruments.add(instrument);
    grouped.set(exposure, current);
  });
  return Array.from(grouped.values())
    .map((item) => ({
      ticker: item.ticker,
      value: item.value,
      weight: pct(item.value, portfolioTotal),
      instrumentCount: item.instruments.size,
      instruments: Array.from(item.instruments),
    }))
    .sort((a, b) => b.value - a.value);
}

export default function DigitalInvestmentTwinView({ summary, positions = [], investments = [] }) {
  const [activeTab, setActiveTab] = useState("chat");
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [referenceScenarioId, setReferenceScenarioId] = useState(() => window.localStorage.getItem(REFERENCE_SCENARIO_KEY) || "");
  const [referenceScenario, setReferenceScenario] = useState(null);
  const [plannerLoading, setPlannerLoading] = useState(true);
  const [plannerError, setPlannerError] = useState("");
  const [investorProfile, setInvestorProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPlannerLoading(true);
        setPlannerError("");
        const response = await apiFetch("/api/planner/scenarios");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = await response.json();
        if (!cancelled) setSavedScenarios(Array.isArray(rows) ? rows : []);
      } catch (error) {
        console.error("Error loading Twin planner scenarios:", error);
        if (!cancelled) setPlannerError("No se pudieron cargar los escenarios de Planner.");
      } finally {
        if (!cancelled) setPlannerLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!referenceScenarioId) {
      setReferenceScenario(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setPlannerError("");
        const response = await apiFetch(`/api/planner/scenarios/${referenceScenarioId}`);
        if (response.status === 404) {
          window.localStorage.removeItem(REFERENCE_SCENARIO_KEY);
          if (!cancelled) {
            setReferenceScenarioId("");
            setReferenceScenario(null);
            setPlannerError("El escenario de referencia ya no existe. Elegí otro.");
          }
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const scenario = await response.json();
        if (!cancelled) setReferenceScenario(scenario);
      } catch (error) {
        console.error("Error loading Twin reference scenario:", error);
        if (!cancelled) setPlannerError("No se pudo cargar el escenario de referencia.");
      }
    })();
    return () => { cancelled = true; };
  }, [referenceScenarioId]);

  function handleReferenceScenarioChange(event) {
    const id = event.target.value || "";
    setReferenceScenarioId(id);
    setReferenceScenario(null);
    if (id) window.localStorage.setItem(REFERENCE_SCENARIO_KEY, id);
    else window.localStorage.removeItem(REFERENCE_SCENARIO_KEY);
  }

  const context = useMemo(() => {
    const portfolioTotal = Number(summary?.total_with_trading_usd || summary?.total_market_usd || 0);
    const cash = positions.filter((p) => ["CASH", "FX"].includes(p.category)).reduce((sum, p) => sum + Number(p.market_value_usd || 0), 0);
    const usdt = positions.filter((p) => tickerOf(p) === "USDT").reduce((sum, p) => sum + Number(p.market_value_usd || 0), 0);
    const investableLiquidity = cash + usdt;
    const crypto = cryptoValueFromInvestments(investments);
    const economicExposures = buildEconomicExposures(investments, portfolioTotal);
    const topExposures = economicExposures.slice(0, 5);
    return {
      portfolioTotal,
      crypto,
      cash,
      usdt,
      investableLiquidity,
      cryptoWeight: pct(crypto, portfolioTotal),
      liquidityWeight: pct(investableLiquidity, portfolioTotal),
      investmentsWeight: Math.max(0, 100 - pct(crypto, portfolioTotal) - pct(investableLiquidity, portfolioTotal)),
      topExposures,
      topWeight: topExposures[0]?.weight || 0,
      topTicker: topExposures[0]?.ticker || "",
    };
  }, [summary, positions, investments]);

  const plannerContext = useMemo(() => {
    if (!referenceScenario) return null;
    return {
      id: referenceScenario.id,
      name: referenceScenario.name || "Escenario sin nombre",
      date: referenceScenario.scenario_date?.value || referenceScenario.scenario_date || null,
      monthlyContributionUsd: Number(referenceScenario.monthly_contribution_usd || 0),
      years: Number(referenceScenario.years || 0),
      fireGoalUsd: Number(referenceScenario.fire_goal_usd || 0),
      annualReturnPct: Number(referenceScenario.annual_return_pct || 0),
      assets: parseAssets(referenceScenario.assets_json),
    };
  }, [referenceScenario]);

  const handleProfileChange = useCallback((profile) => setInvestorProfile(profile), []);
  const profileSummary = investorProfile?.investor_narrative?.trim() || "Todavía estamos construyendo tu forma de invertir.";

  return (
    <section className="space-y-4">
      <header className="rounded-[24px] border border-slate-800/70 bg-slate-950/45 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/10 text-xl text-indigo-300">✦</div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Digital Investment Twin</h1><span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-300">PoC</span></div>
              <p className="mt-0.5 text-xs text-slate-500">Tu contexto. Mejores decisiones.</p>
            </div>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-800/70 bg-slate-950/60 p-1">
            {[['chat','Chat'],['insights','Insights'],['profile','Tu perfil'],['tracking','Seguimiento']].map(([id,label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={`rounded-lg px-3 py-2 text-xs transition ${activeTab === id ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-500 hover:text-slate-300'}`}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0">
          {activeTab === "chat" && (
            <div className="flex min-h-[660px] flex-col rounded-[24px] border border-slate-800/70 bg-slate-950/45">
              <div className="border-b border-slate-800/70 px-5 py-4"><div className="text-sm font-semibold text-white">Consultá a tu Twin</div><div className="mt-1 text-xs text-slate-500">Portfolio + Planner + Investor Model</div></div>
              <div className="flex-1 space-y-4 p-5">
                <div className="ml-auto max-w-[72%] rounded-2xl rounded-br-md border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-300">Tengo una decisión de inversión. Quiero que la analices usando mi cartera, mi plan y mi forma de invertir.</div>
                <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-indigo-500/15 bg-indigo-500/[0.05] p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-300"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15">✦</span>Análisis basado en tu Digital Investment Twin</div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">La estructura ya está lista para responder con tu contexto real. Falta conectar el motor LLM; cuando lo hagamos, esta será la conversación principal del producto.</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <MiniMetric label="Portfolio" value={formatCurrency(context.portfolioTotal, "USD")} />
                    <MiniMetric label="Plan" value={plannerContext?.name || "Sin referencia"} />
                    <MiniMetric label="Perfil" value={investorProfile?.style || (investorProfile?.investor_narrative ? "Narrativa activa" : "Por construir")} />
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-800/70 p-4">
                <div className="flex gap-2"><input disabled placeholder="Preguntame sobre tu portfolio, el mercado o tu plan..." className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-[#020617] px-4 py-3 text-sm text-slate-500 outline-none" /><button disabled className="rounded-xl bg-indigo-500 px-4 text-white opacity-40">➤</button></div>
                <div className="mt-3 flex flex-wrap gap-2">{["¿Qué harías con mi liquidez?","Revisá mi concentración","¿Voy bien contra mi plan?","Analizá BTC"].map((q) => <span key={q} className="rounded-full border border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">{q}</span>)}</div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <InvestorModelPanel observed={{ topTicker: context.topTicker, topWeight: context.topWeight, cryptoWeight: context.cryptoWeight, liquidityWeight: context.liquidityWeight, scenarioName: plannerContext?.name || "" }} onProfileChange={handleProfileChange} />
          )}

          {activeTab === "insights" && (
            <div className="rounded-[24px] border border-slate-800/70 bg-slate-950/45 p-5"><div className="text-sm font-semibold text-white">Insights actuales</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><InsightCard title="Concentración" value={`${context.topTicker || '-'} · ${formatPortfolioPercent(context.topWeight)}`} text="Mayor exposición económica actual." /><InsightCard title="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} text="Exposición crypto sin stablecoins." /><InsightCard title="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} text="Capital disponible sobre el patrimonio total." /></div></div>
          )}

          {activeTab === "tracking" && (
            <div className="rounded-[24px] border border-slate-800/70 bg-slate-950/45 p-8 text-center"><div className="text-sm font-semibold text-white">Seguimiento</div><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">Acá vamos a registrar decisiones, cambios de tesis y cómo evoluciona tu forma de invertir. Todavía no hay memoria de decisiones activa.</p></div>
          )}
        </main>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-slate-800/70 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Tu Portfolio <span className="text-slate-500">(actual)</span></div><span className="text-[10px] text-slate-600">Ahora</span></div>
            <div className="mt-3 text-2xl font-semibold text-white">{formatCurrency(context.portfolioTotal, "USD")}</div>
            <div className="mt-4 space-y-2.5"><PortfolioRow label="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} /><PortfolioRow label="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} /><PortfolioRow label="Resto inversiones" value={formatPortfolioPercent(context.investmentsWeight)} /></div>
            <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Disponible para invertir</div><div className="mt-1 text-base font-semibold text-emerald-300">{formatCurrency(context.investableLiquidity, "USD")}</div><div className="text-[10px] text-slate-600">incluye USDT {formatCurrency(context.usdt, "USD")}</div></div>
          </section>

          <section className="rounded-[20px] border border-slate-800/70 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Tu perfil <span className="text-slate-500">(Digital Twin)</span></div><button onClick={() => setActiveTab("profile")} className="text-[10px] text-indigo-300">Ver / Editar →</button></div>
            <p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-400">{profileSummary}</p>
            <div className="mt-4 space-y-2.5"><ProfileRow label="Estilo" value={investorProfile?.style || "Por definir"} /><ProfileRow label="Concentración" value={investorProfile?.concentration_tolerance || "Por definir"} /><ProfileRow label="Implementación" value={investorProfile?.implementation_style || "Por definir"} /></div>
          </section>

          <section className="rounded-[20px] border border-slate-800/70 bg-slate-950/50 p-4">
            <div className="text-sm font-semibold text-white">Plan de referencia</div>
            <select value={referenceScenarioId} onChange={handleReferenceScenarioChange} disabled={plannerLoading} className="mt-3 w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500"><option value="">{plannerLoading ? "Cargando..." : "Elegir escenario..."}</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name || "Escenario sin nombre"}</option>)}</select>
            {plannerError && <div className="mt-2 text-[10px] text-amber-300">{plannerError}</div>}
            {plannerContext && <div className="mt-3 grid grid-cols-2 gap-2"><TinyStat label="Aporte" value={`${formatCurrency(plannerContext.monthlyContributionUsd, "USD")}/mes`} /><TinyStat label="Horizonte" value={`${plannerContext.years} años`} /><TinyStat label="Retorno" value={formatPortfolioPercent(plannerContext.annualReturnPct)} /><TinyStat label="Objetivo" value={formatCurrency(plannerContext.fireGoalUsd, "USD")} /></div>}
          </section>

          <section className="rounded-[20px] border border-slate-800/70 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Insights recientes</div><button onClick={() => setActiveTab("insights")} className="text-[10px] text-indigo-300">Ver todos →</button></div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-500"><div>• {context.topTicker || "-"} es tu mayor exposición económica ({formatPortfolioPercent(context.topWeight)}).</div><div>• Crypto representa {formatPortfolioPercent(context.cryptoWeight)} del patrimonio.</div><div>• Tenés {formatPortfolioPercent(context.liquidityWeight)} en liquidez disponible.</div></div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function MiniMetric({ label, value }) { return <div className="rounded-xl border border-slate-800/70 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 truncate text-xs font-medium text-slate-200">{value}</div></div>; }
function PortfolioRow({ label, value }) { return <div className="flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-300">{value}</span></div>; }
function ProfileRow({ label, value }) { return <div className="flex items-start justify-between gap-3 text-xs"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">{value}</span></div>; }
function TinyStat({ label, value }) { return <div className="rounded-lg border border-slate-800/70 p-2"><div className="text-[9px] uppercase text-slate-600">{label}</div><div className="mt-1 truncate text-[11px] font-medium text-slate-300">{value}</div></div>; }
function InsightCard({ title, value, text }) { return <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{title}</div><div className="mt-2 text-lg font-semibold text-white">{value}</div><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>; }
