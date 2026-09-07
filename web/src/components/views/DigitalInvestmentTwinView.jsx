import React, { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatPortfolioPercent } from "../../utils/formatters";
import { apiFetch } from "../../utils/api";

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

    const current = grouped.get(exposure) || {
      ticker: exposure,
      value: 0,
      instruments: new Set(),
    };
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
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [referenceScenarioId, setReferenceScenarioId] = useState(
    () => window.localStorage.getItem(REFERENCE_SCENARIO_KEY) || ""
  );
  const [referenceScenario, setReferenceScenario] = useState(null);
  const [plannerLoading, setPlannerLoading] = useState(true);
  const [plannerError, setPlannerError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadScenarios() {
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
    }
    loadScenarios();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!referenceScenarioId) {
      setReferenceScenario(null);
      return;
    }
    let cancelled = false;
    async function loadReferenceScenario() {
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
    }
    loadReferenceScenario();
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
    const cash = positions
      .filter((p) => ["CASH", "FX"].includes(p.category))
      .reduce((sum, p) => sum + Number(p.market_value_usd || 0), 0);
    const usdt = positions
      .filter((p) => tickerOf(p) === "USDT")
      .reduce((sum, p) => sum + Number(p.market_value_usd || 0), 0);
    const investableLiquidity = cash + usdt;

    // En este portfolio la categoría CRYPTO de positions representa USDT.
    // BTC/ETH/SOL/RON forman parte de investments, por lo que la exposición crypto
    // se calcula exclusivamente desde esa fuente para no confundir liquidez con riesgo crypto.
    const crypto = cryptoValueFromInvestments(investments);

    // Para riesgo/concentración el Twin agrupa instrumentos que representan la misma
    // exposición económica (por ejemplo TSLA + BCBA:TSLA, GOOGL + su CEDEAR, MELI + CEDEAR).
    // Conservamos el detalle de instrumentos para trazabilidad, pero el ranking usa el underlying.
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
      topExposures,
      topWeight: topExposures[0]?.weight || 0,
      positionsCount: positions.filter((p) => Number(p.market_value_usd || 0) !== 0).length,
    };
  }, [summary, positions, investments]);

  const plannerContext = useMemo(() => {
    if (!referenceScenario) return null;
    return {
      id: referenceScenario.id,
      name: referenceScenario.name || "Escenario sin nombre",
      date: referenceScenario.scenario_date?.value || referenceScenario.scenario_date || null,
      description: referenceScenario.description || "",
      initialCapitalUsd: Number(referenceScenario.initial_capital_usd || 0),
      initialContributionsUsd: Number(referenceScenario.initial_contributions_usd || 0),
      monthlyContributionUsd: Number(referenceScenario.monthly_contribution_usd || 0),
      years: Number(referenceScenario.years || 0),
      fireGoalUsd: Number(referenceScenario.fire_goal_usd || 0),
      annualReturnPct: Number(referenceScenario.annual_return_pct || 0),
      assets: parseAssets(referenceScenario.assets_json),
    };
  }, [referenceScenario]);

  const pillars = [
    {
      label: "Quién soy",
      value: "Por aprender",
      detail: "Preferencias, convicciones, tolerancia y estilo de decisión. Se construirá con memoria explícita y decisiones reales.",
    },
    {
      label: "Dónde estoy",
      value: formatCurrency(context.portfolioTotal, "USD"),
      detail: `${context.positionsCount} posiciones · Crypto ${formatPortfolioPercent(context.cryptoWeight)} · Liquidez ${formatPortfolioPercent(context.liquidityWeight)}`,
    },
    {
      label: "A dónde voy",
      value: plannerContext?.name || "Sin referencia",
      detail: plannerContext
        ? `${formatCurrency(plannerContext.monthlyContributionUsd, "USD")}/mes · ${plannerContext.years} años · objetivo ${formatCurrency(plannerContext.fireGoalUsd, "USD")}`
        : "Elegí qué escenario guardado de Planner debe usar el Twin como referencia.",
    },
    {
      label: "Cómo cambio",
      value: "Sin historial aún",
      detail: "La memoria de decisiones permitirá detectar cambios de postura, contradicciones y aprendizaje.",
    },
  ];

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Digital Investment Twin</h1>
            <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">PoC</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Un modelo dinámico de tu forma de invertir: quién sos, dónde estás, a dónde vas y cómo está cambiando tu manera de decidir.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">Objetivo de costo IA: &lt; USD 10 / mes</div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((pillar) => (
          <article key={pillar.label} className="rounded-[22px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">{pillar.label}</div>
            <div className="mt-3 text-base font-semibold text-slate-100">{pillar.value}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{pillar.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.8fr)]">
        <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Consultá a tu Twin</div>
              <div className="mt-1 text-xs text-slate-500">Portfolio real + escenario de referencia de Planner forman ahora la base del contexto.</div>
            </div>
            <span className="w-fit rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-300">Context builder · activo</span>
          </div>

          <div className="mt-6 rounded-[22px] border border-slate-800 bg-[#020617] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Escenario de referencia</div>
                <p className="mt-2 text-xs leading-5 text-slate-400">El Twin usa este escenario para interpretar hacia dónde querés ir. Guardar o abrir otro escenario en Planner no cambia esta selección.</p>
              </div>
              <select value={referenceScenarioId} onChange={handleReferenceScenarioChange} disabled={plannerLoading} className="min-w-[240px] rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500">
                <option value="">{plannerLoading ? "Cargando escenarios..." : "Elegir escenario..."}</option>
                {savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name || "Escenario sin nombre"}</option>)}
              </select>
            </div>
            {plannerError && <div className="mt-3 text-xs text-amber-300">{plannerError}</div>}
            {plannerContext && (
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <Metric label="Aporte mensual" value={formatCurrency(plannerContext.monthlyContributionUsd, "USD")} />
                <Metric label="Horizonte" value={`${plannerContext.years} años`} />
                <Metric label="Retorno esperado" value={formatPortfolioPercent(plannerContext.annualReturnPct)} />
                <Metric label="Objetivo" value={formatCurrency(plannerContext.fireGoalUsd, "USD")} />
              </div>
            )}
          </div>

          <div className="mt-4 rounded-[22px] border border-indigo-500/15 bg-indigo-500/[0.05] p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-300"><span className="h-2 w-2 rounded-full bg-indigo-400" /> Contexto determinístico</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Portfolio" value={formatCurrency(context.portfolioTotal, "USD")} />
              <Metric label="Crypto" value={`${formatCurrency(context.crypto, "USD")} · ${formatPortfolioPercent(context.cryptoWeight)}`} />
              <Metric label="Liquidez" value={`${formatCurrency(context.investableLiquidity, "USD")} · ${formatPortfolioPercent(context.liquidityWeight)}`} />
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">Todavía no enviamos esto a un LLM. Portfolio Tracker calcula los hechos; el modelo recibirá sólo el contexto necesario para razonar sobre una decisión.</p>
          </div>

          <div className="mt-5 flex gap-3">
            <input disabled placeholder="Escribí una decisión para analizar..." className="min-w-0 flex-1 rounded-2xl border border-slate-800 bg-[#020617] px-4 py-3 text-sm text-slate-500 outline-none" />
            <button disabled type="button" className="rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-3 text-sm font-medium text-white opacity-50">Analizar</button>
          </div>
        </article>

        <aside className="space-y-5">
          <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="text-sm font-semibold text-white">Estado del Twin</div>
            <div className="mt-4 space-y-4 text-xs">
              <Status label="Portfolio context" value="Conectado" ok />
              <Status label="Planner context" value={plannerContext ? "Conectado" : "Elegir referencia"} ok={Boolean(plannerContext)} />
              <Status label="Investor model" value="Siguiente" />
              <Status label="Decision memory" value="Pendiente" />
              <Status label="LLM" value="Pendiente" />
            </div>
          </article>

          <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Contexto real</div><span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Ahora</span></div>
            <div className="mt-4 space-y-3 text-xs">
              <Row label="Liquidez total" value={formatCurrency(context.investableLiquidity, "USD")} />
              <Row label="USDT" value={formatCurrency(context.usdt, "USD")} />
              <Row label="Crypto sin stablecoins" value={formatCurrency(context.crypto, "USD")} />
              <Row label="Mayor concentración económica" value={formatPortfolioPercent(context.topWeight)} />
            </div>
            {context.topExposures.length > 0 && (
              <div className="mt-5 border-t border-slate-800 pt-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">Principales exposiciones económicas</div>
                <div className="space-y-2">
                  {context.topExposures.map((holding) => (
                    <div key={holding.ticker} className="flex items-start justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-300">{holding.ticker}</div>
                        {holding.instrumentCount > 1 && (
                          <div className="mt-0.5 truncate text-[10px] text-slate-600">{holding.instrumentCount} instrumentos · {holding.instruments.join(" + ")}</div>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums text-slate-500">{formatCurrency(holding.value, "USD")} · {formatPortfolioPercent(holding.weight)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="text-sm font-semibold text-white">Principio de diseño</div>
            <p className="mt-3 text-xs leading-5 text-slate-400">Los números los calcula Portfolio Tracker. El LLM interpreta, compara, desafía y explica; no inventa el estado de la cartera.</p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-sm font-semibold text-white">{value}</div></div>;
}

function Row({ label, value }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="tabular-nums text-slate-200">{value}</span></div>;
}

function Status({ label, value, ok = false }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className={ok ? "text-emerald-300" : "text-amber-300"}>{value}</span></div>;
}
