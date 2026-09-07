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
      economicExposures,
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
      <header className="relative overflow-hidden rounded-[26px] border border-slate-700/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98)_45%,rgba(49,46,129,0.30))] px-5 py-4 shadow-[0_20px_70px_rgba(0,0,0,0.34)] sm:px-6">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-indigo-300/30 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-300/20 bg-gradient-to-br from-indigo-400/30 via-violet-500/20 to-blue-500/10 text-xl text-indigo-100 shadow-[0_10px_30px_rgba(79,70,229,0.24)]">✦</div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Digital Investment Twin</h1><span className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-200">PoC</span></div>
              <p className="mt-0.5 text-xs text-slate-400">Tu contexto. Mejores decisiones.</p>
            </div>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-700/70 bg-slate-950/55 p-1 shadow-inner shadow-black/25 backdrop-blur">
            {[["chat","Chat"],["insights","Insights"],["profile","Tu perfil"],["tracking","Seguimiento"]].map(([id,label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={`rounded-lg px-3.5 py-2 text-xs transition-all ${activeTab === id ? "bg-gradient-to-r from-indigo-500/30 to-blue-500/20 text-white shadow-[0_6px_18px_rgba(79,70,229,0.16)]" : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"}`}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0">
          {activeTab === "chat" && (
            <div className="flex min-h-[680px] flex-col overflow-hidden rounded-[26px] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.92))] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
              <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/45 px-5 py-4">
                <div><div className="text-sm font-semibold text-white">Consultá a tu Twin</div><div className="mt-1 text-xs text-slate-500">Portfolio completo + Planner + Investor Model</div></div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/[0.05] px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Contexto listo</div>
              </div>

              <div className="flex-1 space-y-5 p-5 sm:p-6">
                <div className="ml-auto max-w-[74%] rounded-2xl rounded-br-md border border-blue-400/10 bg-gradient-to-br from-blue-500/14 to-indigo-500/8 px-4 py-3 text-sm leading-6 text-slate-300 shadow-[0_12px_32px_rgba(0,0,0,0.20)]">Tengo una decisión de inversión. Quiero que la analices usando mi cartera completa, mi plan y mi forma de invertir.</div>

                <div className="max-w-[92%] rounded-[22px] rounded-bl-md border border-indigo-400/20 bg-[linear-gradient(135deg,rgba(79,70,229,0.12),rgba(15,23,42,0.86)_45%,rgba(14,116,144,0.06))] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-100"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-indigo-300/20 bg-indigo-500/15 shadow-inner shadow-indigo-400/10">✦</span>Análisis basado en tu Digital Investment Twin</div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">La estructura ya está lista para razonar sobre toda tu cartera. El motor recibirá tus exposiciones económicas, liquidez, plan y perfil antes de responder.</p>

                  <div className="mt-5 grid gap-2.5 sm:grid-cols-4">
                    <MiniMetric label="Portfolio" value={formatCurrency(context.portfolioTotal, "USD")} accent="indigo" icon="◎" />
                    <MiniMetric label="No crypto" value={formatPortfolioPercent(context.nonCryptoWeight)} accent="cyan" icon="◫" />
                    <MiniMetric label="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} accent="violet" icon="◆" />
                    <MiniMetric label="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} accent="emerald" icon="$" />
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4 shadow-inner shadow-black/10">
                    <div className="flex items-center justify-between gap-3"><div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Principales exposiciones económicas</div><button type="button" onClick={() => setActiveTab("insights")} className="text-[10px] font-medium text-cyan-300 transition hover:text-cyan-200">Explorar cartera →</button></div>
                    <div className="mt-3 flex flex-wrap gap-2">{context.topExposures.slice(0,5).map((item,index) => <ExposureChip key={item.ticker} item={item} index={index} />)}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/80 bg-slate-950/60 p-4">
                <div className="flex gap-2"><input disabled placeholder="Preguntame sobre tu portfolio, una posición, el mercado o tu plan..." className="min-w-0 flex-1 rounded-xl border border-slate-700/70 bg-slate-950 px-4 py-3 text-sm text-slate-500 outline-none shadow-inner shadow-black/20" /><button disabled className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 text-white opacity-40 shadow-[0_8px_20px_rgba(59,130,246,0.15)]">➤</button></div>
                <div className="mt-3 flex flex-wrap gap-2">{["¿Qué harías con mi liquidez?","Revisá mi concentración","¿Voy bien contra mi plan?","¿Dónde está mi mayor riesgo?"].map((q) => <span key={q} className="rounded-full border border-slate-700/60 bg-slate-900/50 px-3 py-1.5 text-[10px] text-slate-500 shadow-sm">{q}</span>)}</div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <InvestorModelPanel observed={{ topTicker: context.topTicker, topWeight: context.topWeight, cryptoWeight: context.cryptoWeight, liquidityWeight: context.liquidityWeight, scenarioName: plannerContext?.name || "" }} onProfileChange={handleProfileChange} />
          )}

          {activeTab === "insights" && (
            <div className="space-y-4">
              <section className="rounded-[26px] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.92))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-sm font-semibold text-white">Panorama de cartera</div><p className="mt-1 text-xs text-slate-500">Composición, concentración y liquidez sobre el patrimonio total.</p></div><span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Ahora</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><InsightCard title="Concentración" value={`${context.topTicker || "-"} · ${formatPortfolioPercent(context.topWeight)}`} text="Mayor exposición económica actual." accent="indigo" /><InsightCard title="No crypto" value={formatPortfolioPercent(context.nonCryptoWeight)} text="Acciones, CEDEARs y otras inversiones." accent="cyan" /><InsightCard title="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} text="Crypto sin stablecoins." accent="violet" /><InsightCard title="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} text="Capital disponible sobre patrimonio." accent="emerald" /></div>
              </section>

              <section className="overflow-hidden rounded-[26px] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.94))] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
                <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4"><div><div className="text-sm font-semibold text-white">Todas las exposiciones económicas</div><p className="mt-1 text-xs text-slate-500">Agrupa acción + CEDEAR cuando representan el mismo underlying.</p></div><span className="rounded-full border border-cyan-400/15 bg-cyan-500/[0.05] px-2.5 py-1 text-[9px] text-cyan-300">{context.economicExposures.length} exposiciones</span></div>
                <div className="divide-y divide-slate-800/70">
                  {context.economicExposures.map((item,index) => <ExposureDetailRow key={item.ticker} item={item} index={index} />)}
                </div>
              </section>
            </div>
          )}

          {activeTab === "tracking" && (
            <div className="rounded-[26px] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.92))] p-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)]"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400/15 bg-indigo-500/[0.06] text-lg text-indigo-300">↗</div><div className="mt-4 text-sm font-semibold text-white">Seguimiento</div><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">Acá vamos a registrar decisiones, cambios de tesis y cómo evoluciona tu forma de invertir. Todavía no hay memoria de decisiones activa.</p></div>
          )}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="relative overflow-hidden rounded-[22px] border border-slate-700/70 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96)_55%,rgba(8,47,73,0.40))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.30)]">
            <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-cyan-500/12 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Tu Portfolio <span className="text-slate-500">(actual)</span></div><span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-2 py-1 text-[9px] text-slate-500">Ahora</span></div>
              <div className="mt-3 text-[27px] font-semibold tracking-tight text-white">{formatCurrency(context.portfolioTotal, "USD")}</div>
              <div className="mt-4 overflow-hidden rounded-full bg-slate-800/80 p-[1px]"><div className="flex h-2.5 overflow-hidden rounded-full bg-slate-950"><div className="bg-cyan-400/90" style={{ width: `${context.nonCryptoWeight}%` }} /><div className="bg-violet-400/90" style={{ width: `${context.cryptoWeight}%` }} /><div className="bg-emerald-400/90" style={{ width: `${context.liquidityWeight}%` }} /><div className="bg-slate-500/75" style={{ width: `${context.otherWeight}%` }} /></div></div>
              <div className="mt-4 space-y-2.5"><PortfolioRow label="Acciones / CEDEARs / otros" value={formatPortfolioPercent(context.nonCryptoWeight)} dotClass="bg-cyan-400" /><PortfolioRow label="Crypto" value={formatPortfolioPercent(context.cryptoWeight)} dotClass="bg-violet-400" /><PortfolioRow label="Liquidez" value={formatPortfolioPercent(context.liquidityWeight)} dotClass="bg-emerald-400" />{context.otherWeight > 0.5 && <PortfolioRow label="Otros / trading" value={formatPortfolioPercent(context.otherWeight)} dotClass="bg-slate-500" />}</div>
              <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-gradient-to-r from-emerald-500/[0.10] to-cyan-500/[0.05] p-3.5 shadow-inner shadow-black/10"><div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[0.13em] text-slate-500">Disponible para invertir</div><div className="mt-1 text-base font-semibold text-emerald-300">{formatCurrency(context.investableLiquidity, "USD")}</div></div><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-500/10 text-sm text-emerald-300">$</div></div><div className="mt-1 text-[10px] text-slate-600">incluye USDT {formatCurrency(context.usdt, "USD")}</div></div>
            </div>
          </section>

          <section className="rounded-[22px] border border-slate-700/70 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(2,6,23,0.96))] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.26)]">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Principales exposiciones</div><button type="button" onClick={() => setActiveTab("insights")} className="rounded-lg border border-cyan-400/10 bg-cyan-500/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-cyan-300 transition hover:border-cyan-300/20 hover:bg-cyan-500/[0.08]">Ver todas →</button></div>
            <div className="mt-4 space-y-3">{context.topExposures.slice(0,5).map((item,index) => <ExposureRow key={item.ticker} item={item} index={index} />)}</div>
          </section>

          <section className="rounded-[22px] border border-slate-700/70 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(30,27,75,0.32))] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.26)]">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Tu perfil <span className="text-slate-500">(Digital Twin)</span></div><button onClick={() => setActiveTab("profile")} className="text-[10px] font-medium text-indigo-300 transition hover:text-indigo-200">Ver / Editar →</button></div>
            <p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-400">{profileSummary}</p>
            <div className="mt-4 space-y-2.5"><ProfileRow label="Estilo" value={investorProfile?.style || "Por definir"} /><ProfileRow label="Concentración" value={investorProfile?.concentration_tolerance || "Por definir"} /><ProfileRow label="Implementación" value={investorProfile?.implementation_style || "Por definir"} /></div>
          </section>

          <section className="rounded-[22px] border border-slate-700/70 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(2,6,23,0.96))] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.26)]">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Plan de referencia</div>{plannerContext && <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]" />}</div>
            <select value={referenceScenarioId} onChange={handleReferenceScenarioChange} disabled={plannerLoading} className="mt-3 w-full rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-xs text-slate-300 outline-none transition focus:border-indigo-400"><option value="">{plannerLoading ? "Cargando..." : "Elegir escenario..."}</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name || "Escenario sin nombre"}</option>)}</select>
            {plannerError && <div className="mt-2 text-[10px] text-amber-300">{plannerError}</div>}
            {plannerContext && <div className="mt-3 grid grid-cols-2 gap-2"><TinyStat label="Aporte" value={`${formatCurrency(plannerContext.monthlyContributionUsd, "USD")}/mes`} /><TinyStat label="Horizonte" value={`${plannerContext.years} años`} /><TinyStat label="Retorno" value={formatPortfolioPercent(plannerContext.annualReturnPct)} /><TinyStat label="Objetivo" value={formatCurrency(plannerContext.fireGoalUsd, "USD")} /></div>}
          </section>
        </aside>
      </div>
    </section>
  );
}

function MiniMetric({ label, value, accent = "indigo", icon = "•" }) {
  const accents = { indigo: "border-indigo-400/15 from-indigo-500/[0.10]", cyan: "border-cyan-400/15 from-cyan-500/[0.10]", violet: "border-violet-400/15 from-violet-500/[0.10]", emerald: "border-emerald-400/15 from-emerald-500/[0.10]" };
  return <div className={`rounded-xl border bg-gradient-to-br ${accents[accent] || accents.indigo} to-slate-950/50 p-3 shadow-inner shadow-black/10`}><div className="flex items-center justify-between"><div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</div><span className="text-[10px] text-slate-500">{icon}</span></div><div className="mt-1.5 truncate text-xs font-semibold text-slate-100">{value}</div></div>;
}
function PortfolioRow({ label, value, dotClass }) { return <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-400"><span className={`h-2 w-2 rounded-full ${dotClass} shadow-[0_0_8px_currentColor]`} />{label}</span><span className="font-medium text-slate-100">{value}</span></div>; }
function ProfileRow({ label, value }) { return <div className="flex items-start justify-between gap-3 text-xs"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-300">{value}</span></div>; }
function TinyStat({ label, value }) { return <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-2.5 shadow-inner shadow-black/10"><div className="text-[9px] uppercase tracking-[0.08em] text-slate-600">{label}</div><div className="mt-1 truncate text-[11px] font-medium text-slate-200">{value}</div></div>; }
function ExposureRow({ item, index }) {
  const dots = ["bg-indigo-400","bg-cyan-400","bg-violet-400","bg-amber-400","bg-emerald-400","bg-slate-400"];
  return <div className="group"><div className="flex items-start justify-between gap-3 text-xs"><div className="flex min-w-0 items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dots[index % dots.length]}`} /><div className="min-w-0"><div className="font-medium text-slate-100">{item.ticker}</div>{item.instrumentCount > 1 && <div className="truncate text-[9px] text-slate-600">{item.instrumentCount} instrumentos</div>}</div></div><div className="shrink-0 text-right"><div className="font-medium text-slate-200">{formatPortfolioPercent(item.weight)}</div><div className="text-[9px] text-slate-600">{formatCurrency(item.value, "USD")}</div></div></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/70"><div className={`h-full rounded-full ${dots[index % dots.length]}`} style={{ width: `${Math.min(100, item.weight * 2.4)}%`, opacity: 0.75 }} /></div></div>;
}
function ExposureChip({ item, index }) {
  const styles = ["border-indigo-400/15 bg-indigo-500/[0.06] text-indigo-200","border-cyan-400/15 bg-cyan-500/[0.06] text-cyan-200","border-violet-400/15 bg-violet-500/[0.06] text-violet-200","border-amber-400/15 bg-amber-500/[0.06] text-amber-200","border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-200"];
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] ${styles[index % styles.length]}`}><span className="font-medium">{item.ticker}</span> <span className="opacity-65">{formatPortfolioPercent(item.weight)}</span></span>;
}
function ExposureDetailRow({ item, index }) {
  const dots = ["bg-indigo-400","bg-cyan-400","bg-violet-400","bg-amber-400","bg-emerald-400","bg-sky-400","bg-rose-400","bg-teal-400"];
  return <div className="grid gap-3 px-5 py-4 transition hover:bg-slate-900/45 sm:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)_110px_110px] sm:items-center"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dots[index % dots.length]}`} /><div><div className="text-sm font-semibold text-slate-100">{item.ticker}</div><div className="mt-0.5 text-[10px] text-slate-600">#{index + 1} por exposición</div></div></div><div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80"><div className={`h-full rounded-full ${dots[index % dots.length]}`} style={{ width: `${Math.min(100, item.weight * 2.4)}%`, opacity: 0.8 }} /></div><div className="mt-1.5 truncate text-[10px] text-slate-600">{item.instrumentCount > 1 ? item.instruments.join(" + ") : item.instruments[0] || item.ticker}</div></div><div className="text-left sm:text-right"><div className="text-xs font-semibold text-slate-200">{formatPortfolioPercent(item.weight)}</div><div className="text-[9px] uppercase text-slate-600">del portfolio</div></div><div className="text-left sm:text-right"><div className="text-xs font-semibold text-slate-200">{formatCurrency(item.value, "USD")}</div><div className="text-[9px] uppercase text-slate-600">exposición</div></div></div>;
}
function InsightCard({ title, value, text, accent = "indigo" }) {
  const accents = { indigo: "from-indigo-500/[0.12] border-indigo-400/10", cyan: "from-cyan-500/[0.12] border-cyan-400/10", violet: "from-violet-500/[0.12] border-violet-400/10", emerald: "from-emerald-500/[0.12] border-emerald-400/10" };
  return <div className={`rounded-2xl border bg-gradient-to-br ${accents[accent]} to-slate-950/85 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.20)]`}><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{title}</div><div className="mt-2 text-lg font-semibold text-white">{value}</div><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>;
}
