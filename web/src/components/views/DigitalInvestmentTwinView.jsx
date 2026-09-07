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
    const investmentValue = investments.reduce((sum, row) => sum + Number(row?.market_value_usd || 0), 0);
    const nonCryptoInvestments = Math.max(0, investmentValue - crypto);
    const other = Math.max(0, portfolioTotal - crypto - nonCryptoInvestments - investableLiquidity);
    const economicExposures = buildEconomicExposures(investments, portfolioTotal);
    const topExposures = economicExposures.slice(0, 6);
    return {
      portfolioTotal,
      crypto,
      nonCryptoInvestments,
      other,
      cash,
      usdt,
      investableLiquidity,
      cryptoWeight: pct(crypto, portfolioTotal),
      nonCryptoWeight: pct(nonCryptoInvestments, portfolioTotal),
      liquidityWeight: pct(investableLiquidity, portfolioTotal),
      otherWeight: pct(other, portfolioTotal),
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
      <header className="relative overflow-hidden rounded-[24px] border border-slate-700/60 bg-gradient-to-r from-slate-950 via-slate-950 to-indigo-950/35 px-5 py-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:px-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/30 to-violet-500/10 text-xl text-indigo-200 shadow-[0_8px_24px_rgba(79,70,229,0.18)]">✦</div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Digital Investment Twin</h1><span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-200">PoC</span></div>
              <p className="mt-0.5 text-xs text-slate-400">Tu contexto. Mejores decisiones.</p>
            </div>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-700/60 bg-slate-900/70 p-1 shadow-inner shadow-black/20">
            {[["chat","Chat"],["insights","Insights"],["profile","Tu perfil"],["tracking","Seguimiento"]].map(([id,label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={`rounded-lg px-3 py-2 text-xs transition ${activeTab === id ? "bg-gradient-to-r from-indigo-500/25 to-blue-500/15 text-indigo-100 shadow-sm" : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"}`}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <main className="min-w-0">
          {activeTab === "chat" && (
            <div className="flex min-h-[660px] flex-col overflow-hidden rounded-[24px] border border-slate-700/60 bg-gradient-to-b from-slate-900/72 to-slate-950/72 shadow-[0_22px_70px_rgba(0,0,0,0.30)]">
              <div className="border-b border-slate-800/80 bg-slate-900/45 px-5 py-4"><div className="text-sm font-semibold text-white">Consultá a tu Twin</div><div className="mt-1 text-xs text-slate-500">Portfolio completo + Planner + Investor Model</div></div>
              <div className="flex-1 space-y-4 p-5">
                <div className="ml-auto max-w-[72%] rounded-2xl rounded-br-md border border-blue-400/10 bg-gradient-to-br from-blue-500/12 to-indigo-500/8 px-4 py-3 text-sm leading-6 text-slate-300 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">Tengo una decisión de inversión. Quiero que la analices usando mi cartera completa, mi plan y mi forma de invertir.</div>
                <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-indigo-400/20 bg-gradient-to-br from-indigo-500/[0.10] via-slate-900/80 to-blue-500/[0.05] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-200"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-500/15">✦</span>Análisis basado en tu Digital Investment Twin</div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">La estructura ya está lista para razonar sobre toda tu cartera, no sólo crypto. El motor recibirá tus exposiciones económicas, liquidez, plan y perfil antes de responder.</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <MiniMetric label="Portfolio" value={formatCurrency(context.portfolioTotal, "USD")} accent="indigo" />
                    <MiniMetric label="No crypto" value={formatPortfolioPercent(context.nonCryptoWeight)} accent="cyan" />
                    <MiniMetric label="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} accent="violet" />
                    <MiniMetric label="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} accent="emerald" />
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-950/35 p-3">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Principales exposiciones económicas</div>
                    <div className="mt-2 flex flex-wrap gap-2">{context.topExposures.slice(0,5).map((item) => <span key={item.ticker} className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">{item.ticker} <span className="text-slate-500">{formatPortfolioPercent(item.weight)}</span></span>)}</div>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-800/80 bg-slate-950/55 p-4">
                <div className="flex gap-2"><input disabled placeholder="Preguntame sobre tu portfolio, una posición, el mercado o tu plan..." className="min-w-0 flex-1 rounded-xl border border-slate-700/70 bg-slate-950 px-4 py-3 text-sm text-slate-500 outline-none shadow-inner shadow-black/20" /><button disabled className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 text-white opacity-40">➤</button></div>
                <div className="mt-3 flex flex-wrap gap-2">{["¿Qué harías con mi liquidez?","Revisá mi concentración","¿Voy bien contra mi plan?","¿Dónde está mi mayor riesgo?"].map((q) => <span key={q} className="rounded-full border border-slate-700/60 bg-slate-900/45 px-3 py-1.5 text-[10px] text-slate-500">{q}</span>)}</div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <InvestorModelPanel observed={{ topTicker: context.topTicker, topWeight: context.topWeight, cryptoWeight: context.cryptoWeight, liquidityWeight: context.liquidityWeight, scenarioName: plannerContext?.name || "" }} onProfileChange={handleProfileChange} />
          )}

          {activeTab === "insights" && (
            <div className="rounded-[24px] border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-950/70 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.28)]"><div className="text-sm font-semibold text-white">Insights actuales</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><InsightCard title="Concentración" value={`${context.topTicker || "-"} · ${formatPortfolioPercent(context.topWeight)}`} text="Mayor exposición económica actual." accent="indigo" /><InsightCard title="No crypto" value={formatPortfolioPercent(context.nonCryptoWeight)} text="Acciones, CEDEARs y otras inversiones no crypto." accent="cyan" /><InsightCard title="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} text="Exposición crypto sin stablecoins." accent="violet" /><InsightCard title="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} text="Capital disponible sobre el patrimonio total." accent="emerald" /></div></div>
          )}

          {activeTab === "tracking" && (
            <div className="rounded-[24px] border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-950/70 p-8 text-center shadow-[0_22px_70px_rgba(0,0,0,0.28)]"><div className="text-sm font-semibold text-white">Seguimiento</div><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">Acá vamos a registrar decisiones, cambios de tesis y cómo evoluciona tu forma de invertir. Todavía no hay memoria de decisiones activa.</p></div>
          )}
        </main>

        <aside className="space-y-4">
          <section className="relative overflow-hidden rounded-[20px] border border-slate-700/60 bg-gradient-to-br from-slate-900/90 via-slate-950/92 to-blue-950/35 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.25)]">
            <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Tu Portfolio <span className="text-slate-500">(actual)</span></div><span className="text-[10px] text-slate-600">Ahora</span></div>
              <div className="mt-3 text-2xl font-semibold text-white">{formatCurrency(context.portfolioTotal, "USD")}</div>
              <div className="mt-4 overflow-hidden rounded-full bg-slate-800/80 p-[1px]"><div className="flex h-2 overflow-hidden rounded-full bg-slate-950"><div className="bg-cyan-400/80" style={{ width: `${context.nonCryptoWeight}%` }} /><div className="bg-violet-400/80" style={{ width: `${context.cryptoWeight}%` }} /><div className="bg-emerald-400/80" style={{ width: `${context.liquidityWeight}%` }} /><div className="bg-slate-500/70" style={{ width: `${context.otherWeight}%` }} /></div></div>
              <div className="mt-4 space-y-2.5"><PortfolioRow label="Acciones / CEDEARs / otros" value={formatPortfolioPercent(context.nonCryptoWeight)} dotClass="bg-cyan-400" /><PortfolioRow label="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} dotClass="bg-violet-400" /><PortfolioRow label="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} dotClass="bg-emerald-400" />{context.otherWeight > 0.5 && <PortfolioRow label="Otros / trading" value={formatPortfolioPercent(context.otherWeight)} dotClass="bg-slate-500" />}</div>
              <div className="mt-4 rounded-xl border border-emerald-400/15 bg-gradient-to-r from-emerald-500/[0.08] to-cyan-500/[0.04] p-3 shadow-inner shadow-black/10"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Disponible para invertir</div><div className="mt-1 text-base font-semibold text-emerald-300">{formatCurrency(context.investableLiquidity, "USD")}</div><div className="text-[10px] text-slate-600">incluye USDT {formatCurrency(context.usdt, "USD")}</div></div>
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-700/60 bg-gradient-to-br from-slate-900/88 to-slate-950/92 p-4 shadow-[0_14px_38px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Principales exposiciones</div><button onClick={() => setActiveTab("insights")} className="text-[10px] text-cyan-300">Ver todas →</button></div>
            <div className="mt-3 space-y-2.5">{context.topExposures.slice(0,5).map((item,index) => <ExposureRow key={item.ticker} item={item} index={index} />)}</div>
          </section>

          <section className="rounded-[20px] border border-slate-700/60 bg-gradient-to-br from-slate-900/88 to-indigo-950/25 p-4 shadow-[0_14px_38px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Tu perfil <span className="text-slate-500">(Digital Twin)</span></div><button onClick={() => setActiveTab("profile")} className="text-[10px] text-indigo-300">Ver / Editar →</button></div>
            <p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-400">{profileSummary}</p>
            <div className="mt-4 space-y-2.5"><ProfileRow label="Estilo" value={investorProfile?.style || "Por definir"} /><ProfileRow label="Concentración" value={investorProfile?.concentration_tolerance || "Por definir"} /><ProfileRow label="Implementación" value={investorProfile?.implementation_style || "Por definir"} /></div>
          </section>

          <section className="rounded-[20px] border border-slate-700/60 bg-gradient-to-br from-slate-900/88 to-slate-950/92 p-4 shadow-[0_14px_38px_rgba(0,0,0,0.22)]">
            <div className="text-sm font-semibold text-white">Plan de referencia</div>
            <select value={referenceScenarioId} onChange={handleReferenceScenarioChange} disabled={plannerLoading} className="mt-3 w-full rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500"><option value="">{plannerLoading ? "Cargando..." : "Elegir escenario..."}</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name || "Escenario sin nombre"}</option>)}</select>
            {plannerError && <div className="mt-2 text-[10px] text-amber-300">{plannerError}</div>}
            {plannerContext && <div className="mt-3 grid grid-cols-2 gap-2"><TinyStat label="Aporte" value={`${formatCurrency(plannerContext.monthlyContributionUsd, "USD")}/mes`} /><TinyStat label="Horizonte" value={`${plannerContext.years} años`} /><TinyStat label="Retorno" value={formatPortfolioPercent(plannerContext.annualReturnPct)} /><TinyStat label="Objetivo" value={formatCurrency(plannerContext.fireGoalUsd, "USD")} /></div>}
          </section>
        </aside>
      </div>
    </section>
  );
}

function MiniMetric({ label, value, accent = "indigo" }) {
  const accents = { indigo: "border-indigo-400/15 bg-indigo-500/[0.06]", cyan: "border-cyan-400/15 bg-cyan-500/[0.06]", violet: "border-violet-400/15 bg-violet-500/[0.06]", emerald: "border-emerald-400/15 bg-emerald-500/[0.06]" };
  return <div className={`rounded-xl border p-3 shadow-inner shadow-black/10 ${accents[accent] || accents.indigo}`}><div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 truncate text-xs font-medium text-slate-200">{value}</div></div>;
}
function PortfolioRow({ label, value, dotClass }) { return <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-400"><span className={`h-2 w-2 rounded-full ${dotClass}`} />{label}</span><span className="font-medium text-slate-200">{value}</span></div>; }
function ProfileRow({ label, value }) { return <div className="flex items-start justify-between gap-3 text-xs"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">{value}</span></div>; }
function TinyStat({ label, value }) { return <div className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-2 shadow-inner shadow-black/10"><div className="text-[9px] uppercase text-slate-600">{label}</div><div className="mt-1 truncate text-[11px] font-medium text-slate-300">{value}</div></div>; }
function ExposureRow({ item, index }) {
  const dots = ["bg-indigo-400","bg-cyan-400","bg-violet-400","bg-amber-400","bg-emerald-400","bg-slate-400"];
  return <div className="flex items-start justify-between gap-3 text-xs"><div className="flex min-w-0 items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dots[index % dots.length]}`} /><div className="min-w-0"><div className="font-medium text-slate-200">{item.ticker}</div>{item.instrumentCount > 1 && <div className="truncate text-[9px] text-slate-600">{item.instrumentCount} instrumentos</div>}</div></div><div className="shrink-0 text-right"><div className="text-slate-300">{formatPortfolioPercent(item.weight)}</div><div className="text-[9px] text-slate-600">{formatCurrency(item.value, "USD")}</div></div></div>;
}
function InsightCard({ title, value, text, accent = "indigo" }) {
  const accents = { indigo: "from-indigo-500/[0.10]", cyan: "from-cyan-500/[0.10]", violet: "from-violet-500/[0.10]", emerald: "from-emerald-500/[0.10]" };
  return <div className={`rounded-2xl border border-slate-700/60 bg-gradient-to-br ${accents[accent]} to-slate-950/80 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.18)]`}><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{title}</div><div className="mt-2 text-lg font-semibold text-white">{value}</div><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>;
}
