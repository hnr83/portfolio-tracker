import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import AssetAvatar from "../../shared/AssetAvatar";
import { formatCurrency } from "../../../utils/formatters";
import { apiFetch } from "../../../utils/api";
import { usePortfolioData } from "../../../context/PortfolioDataContext";

function getAssetDisplayName(ticker = "", rawTicker = "") {
  const t = String(ticker || rawTicker || "").toUpperCase();
  const raw = String(rawTicker || "").toUpperCase();

  const nameMap = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    SOL: "Solana",
    RON: "Ronin",
    USDT: "Tether",
    TSLA: raw.startsWith("BCBA:") ? "Tesla CEDEAR" : "Tesla",
    GOOGL: raw.startsWith("BCBA:") ? "Alphabet CEDEAR" : "Alphabet",
    GOOG: raw.startsWith("BCBA:") ? "Alphabet CEDEAR" : "Alphabet",
    AAPL: raw.startsWith("BCBA:") ? "Apple CEDEAR" : "Apple",
    MELI: raw.startsWith("BCBA:") ? "Mercado Libre CEDEAR" : "Mercado Libre",
    ARKK: "ARK Innovation ETF",
    ARKG: "ARK Genomic Revolution ETF",
    SPY: "S&P 500 ETF",
    QQQ: "Nasdaq 100 ETF",
  };

  return nameMap[t] || "Activo";
}

const DEFAULT_ASSETS = [
  { ticker: "BTC", name: "Bitcoin", allocation: 30, expectedReturn: 18 },
  { ticker: "ETH", name: "Ethereum", allocation: 20, expectedReturn: 22 },
  { ticker: "TSLA", name: "Tesla", allocation: 20, expectedReturn: 15 },
  { ticker: "GOOGL", name: "Alphabet", allocation: 10, expectedReturn: 10 },
  { ticker: "MELI", name: "Mercado Libre", allocation: 10, expectedReturn: 12 },
  { ticker: "SPY", name: "ETF USA", allocation: 10, expectedReturn: 8 },
];

function getDefaultExpectedReturn(ticker = "") {
  const t = String(ticker).toUpperCase();
  if (t.includes("BTC")) return 18;
  if (t.includes("ETH")) return 22;
  if (t.includes("TSLA")) return 15;
  if (t.includes("MELI")) return 12;
  if (t.includes("GOOGL") || t.includes("GOOG")) return 10;
  if (t.includes("ARK")) return 12;
  if (t.includes("SPY") || t.includes("QQQ")) return 8;
  return 8;
}

function formatUsd(value) {
  return formatCurrency(Number(value || 0), "USD");
}

function compactUsd(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `USD ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `USD ${(n / 1_000).toFixed(0)}k`;
  return formatUsd(n);
}

function formatPct(value, decimals = 1) {
  return `${Number(value || 0).toFixed(decimals)}%`;
}

function dateValue(value) {
  return value?.value || value || "";
}

function formatScenarioDate(value) {
  const raw = dateValue(value);
  if (!raw) return "";
  const [year, month, day] = String(raw).slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : String(raw);
}

function todayLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateWeightedReturn(assets) {
  return (
    assets.reduce(
      (sum, asset) =>
        sum + (Number(asset.allocation || 0) / 100) * Number(asset.expectedReturn || 0),
      0
    ) || 0
  );
}

function projectSeries({ initialCapital, initialContributions, monthlyContribution, years, annualReturn }) {
  const rows = [];
  let value = Number(initialCapital || 0);
  let contributions = Number(initialContributions ?? initialCapital ?? 0);
  const annualContribution = Number(monthlyContribution || 0) * 12;
  const startYear = new Date().getFullYear();

  rows.push({ year: "Hoy", value, contributions, gain: value - contributions });

  for (let i = 1; i <= years; i += 1) {
    value = value * (1 + Number(annualReturn || 0) / 100) + annualContribution;
    contributions += annualContribution;
    rows.push({
      year: `${startYear + i}`,
      value,
      contributions,
      gain: value - contributions,
    });
  }

  return rows;
}

function ProjectionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 shadow-xl">
      <div className="mb-3 font-semibold text-white">{label}</div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-6 text-slate-400">
          <span>Aportes acumulados</span>
          <span>{formatUsd(row.contributions)}</span>
        </div>
        <div className="flex items-center justify-between gap-6 text-emerald-400">
          <span>Rendimiento acumulado</span>
          <span>{formatUsd(row.baseGain)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-slate-800 pt-2 font-semibold text-white">
          <span>Total proyectado</span>
          <span>{formatUsd(row.base)}</span>
        </div>
      </div>
    </div>
  );
}

export default function PlannerView({ summary, positions = [] }) {
  const { fetchCached } = usePortfolioData();
  const [activeTab, setActiveTab] = useState("projections");
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [scenarioError, setScenarioError] = useState("");
  const [scenarioNotice, setScenarioNotice] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDate, setScenarioDate] = useState(todayLocal());
  const [scenarioDescription, setScenarioDescription] = useState("");

  const investedSnapshot = useMemo(() => {
    const investable = (positions || []).filter((p) => p.category === "PORTFOLIO");
    return investable.reduce(
      (acc, p) => ({
        marketValue: acc.marketValue + Number(p.market_value_usd || 0),
        costValue: acc.costValue + Number(p.cost_value_usd || 0),
      }),
      { marketValue: 0, costValue: 0 }
    );
  }, [positions]);

  const realInitialCapital = Number(investedSnapshot.marketValue || 167000);
  const realInitialContributions = Number(investedSnapshot.costValue || realInitialCapital);

  const realAssets = useMemo(() => {
    const investable = (positions || []).filter((p) => p.category === "PORTFOLIO");
    const total = investable.reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);
    if (!total) return DEFAULT_ASSETS;

    return investable
      .filter((p) => Number(p.market_value_usd || 0) > 0)
      .map((p) => {
        const rawTicker = p.ticker;
        const ticker = p.normalized_ticker || p.ticker;
        return {
          rawTicker,
          ticker,
          name:
            p.name ||
            p.asset_name ||
            p.description ||
            p.ticker_name ||
            getAssetDisplayName(ticker, rawTicker),
          allocation: Number(((Number(p.market_value_usd || 0) / total) * 100).toFixed(1)),
          expectedReturn: getDefaultExpectedReturn(ticker),
        };
      });
  }, [positions]);

  const [initialCapital, setInitialCapital] = useState(realInitialCapital);
  const [initialContributions, setInitialContributions] = useState(realInitialContributions);
  const [assets, setAssets] = useState(realAssets);
  const [monthlyContribution, setMonthlyContribution] = useState(2000);
  const [years, setYears] = useState(10);
  const [fireGoal, setFireGoal] = useState(2_500_000);

  const isSavedScenario = Boolean(selectedScenario?.id);

  useEffect(() => {
    if (!isSavedScenario && realInitialCapital > 0) setInitialCapital(realInitialCapital);
  }, [realInitialCapital, isSavedScenario]);

  useEffect(() => {
    if (!isSavedScenario && Number.isFinite(realInitialContributions) && realInitialContributions >= 0) {
      setInitialContributions(realInitialContributions);
    }
  }, [realInitialContributions, isSavedScenario]);

  useEffect(() => {
    if (!isSavedScenario && realAssets?.length) setAssets(realAssets);
  }, [realAssets, isSavedScenario]);

  async function loadScenarios(force = false) {
    try {
      setLoadingScenarios(true);
      setScenarioError("");
      const rows = await fetchCached("planner:scenarios", async () => {
        const response = await apiFetch("/api/planner/scenarios");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }, { ttlMs: 5 * 60 * 1000, force });
      setSavedScenarios(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error("Error loading planner scenarios:", error);
      setScenarioError("No se pudieron cargar los escenarios guardados.");
    } finally {
      setLoadingScenarios(false);
    }
  }

  useEffect(() => {
    loadScenarios();
  }, []);

  function parseAssets(raw) {
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function applySavedScenario(scenario) {
    const parsedAssets = parseAssets(scenario.assets_json);
    setSelectedScenario(scenario);
    setInitialCapital(Number(scenario.initial_capital_usd || 0));
    setInitialContributions(Number(scenario.initial_contributions_usd || 0));
    setMonthlyContribution(Number(scenario.monthly_contribution_usd || 0));
    setYears(Number(scenario.years || 10));
    setFireGoal(Number(scenario.fire_goal_usd || 0));
    if (parsedAssets.length) setAssets(parsedAssets);
  }

  function restoreCurrentScenario() {
    setSelectedScenario(null);
    setInitialCapital(realInitialCapital);
    setInitialContributions(realInitialContributions);
    setAssets(realAssets?.length ? realAssets : DEFAULT_ASSETS);
    setMonthlyContribution(2000);
    setYears(10);
    setFireGoal(2_500_000);
    setScenarioNotice("");
    setScenarioError("");
  }

  async function handleScenarioSelect(event) {
    const id = event.target.value;
    if (!id) {
      restoreCurrentScenario();
      return;
    }

    try {
      setScenarioError("");
      const response = await apiFetch(`/api/planner/scenarios/${id}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const scenario = await response.json();
      applySavedScenario(scenario);
    } catch (error) {
      console.error("Error loading planner scenario:", error);
      setScenarioError("No se pudo abrir el escenario seleccionado.");
    }
  }

  async function handleSaveScenario(event) {
    event.preventDefault();
    if (!scenarioName.trim() || !scenarioDate) return;

    try {
      setSavingScenario(true);
      setScenarioError("");
      setScenarioNotice("");

      const response = await apiFetch("/api/planner/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scenarioName.trim(),
          scenarioDate,
          description: scenarioDescription.trim(),
          initialCapital,
          initialContributions,
          monthlyContribution,
          years,
          fireGoal,
          annualReturn: calculateWeightedReturn(assets),
          assets,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      setSaveModalOpen(false);
      setScenarioName("");
      setScenarioDescription("");
      setScenarioDate(todayLocal());
      setScenarioNotice("Escenario guardado correctamente.");
      applySavedScenario(result);
      await loadScenarios(true);
    } catch (error) {
      console.error("Error saving planner scenario:", error);
      setScenarioError(error.message || "No se pudo guardar el escenario.");
    } finally {
      setSavingScenario(false);
    }
  }

  async function handleDeleteScenario() {
    if (!selectedScenario?.id) return;
    if (!window.confirm(`¿Eliminar el escenario "${selectedScenario.name}"?`)) return;

    try {
      setScenarioError("");
      const response = await apiFetch(`/api/planner/scenarios/${selectedScenario.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) throw new Error(`HTTP ${response.status}`);
      restoreCurrentScenario();
      setScenarioNotice("Escenario eliminado.");
      await loadScenarios(true);
    } catch (error) {
      console.error("Error deleting planner scenario:", error);
      setScenarioError("No se pudo eliminar el escenario.");
    }
  }

  const weightedReturn = useMemo(() => calculateWeightedReturn(assets), [assets]);
  const activeBaseReturn = isSavedScenario
    ? Number(selectedScenario.annual_return_pct || weightedReturn)
    : weightedReturn;

  const scenarios = useMemo(
    () => [
      {
        key: "conservative",
        label: "Conservador",
        returnPct: Math.max(activeBaseReturn * 0.55, 3),
        description: "Mercado moderado",
      },
      {
        key: "base",
        label: "Base",
        returnPct: activeBaseReturn,
        description: "Escenario esperado",
      },
      {
        key: "aggressive",
        label: "Agresivo",
        returnPct: activeBaseReturn * 1.35,
        description: "Bull case",
      },
    ],
    [activeBaseReturn]
  );

  const chartData = useMemo(() => {
    const projected = scenarios.map((scenario) => ({
      scenario,
      rows: projectSeries({
        initialCapital,
        initialContributions,
        monthlyContribution,
        years,
        annualReturn: scenario.returnPct,
      }),
    }));

    return projected[1].rows.map((row, index) => ({
      year: row.year,
      contributions: row.contributions,
      baseGain: projected[1].rows[index].gain,
      conservative: projected[0].rows[index].value,
      base: projected[1].rows[index].value,
      aggressive: projected[2].rows[index].value,
    }));
  }, [scenarios, initialCapital, initialContributions, monthlyContribution, years]);

  const baseFinal = chartData[chartData.length - 1]?.base || 0;
  const baseContributions = chartData[chartData.length - 1]?.contributions || 0;
  const baseGain = baseFinal - baseContributions;
  const fireProgress = fireGoal > 0 ? (baseFinal / fireGoal) * 100 : 0;
  const annualContribution = monthlyContribution * 12;
  const totalFutureContributions = annualContribution * years;
  const totalAllocation = assets.reduce((sum, asset) => sum + Number(asset.allocation || 0), 0);

  const topGrowthAsset = [...assets].sort(
    (a, b) =>
      (b.allocation / 100) * b.expectedReturn -
      (a.allocation / 100) * a.expectedReturn
  )[0];

  function updateAsset(index, field, value) {
    if (isSavedScenario) return;
    setAssets((prev) =>
      prev.map((asset, i) =>
        i === index ? { ...asset, [field]: Number(value) } : asset
      )
    );
  }

  const inputClass =
    "w-full rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-55";

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-800/80 pb-5 md:flex-row md:items-end">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-indigo-300">Portfolio Planner</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Planner</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Proyectá tu patrimonio, simulá aportes y entendé qué variables te acercan más rápido a tus objetivos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedScenario?.id || ""}
            onChange={handleScenarioSelect}
            disabled={loadingScenarios}
            className="max-w-[300px] rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="">Escenario actual</option>
            {savedScenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name} · {formatScenarioDate(scenario.scenario_date)}
              </option>
            ))}
          </select>

          {isSavedScenario ? (
            <button
              type="button"
              onClick={handleDeleteScenario}
              className="rounded-2xl border border-rose-500/30 px-4 py-2.5 text-sm text-rose-300 transition hover:bg-rose-500/10"
            >
              Eliminar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setScenarioError("");
                setScenarioNotice("");
                setSaveModalOpen(true);
              }}
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(93,124,250,0.30)] transition hover:opacity-90"
            >
              Guardar escenario
            </button>
          )}
        </div>
      </header>

      {(scenarioNotice || scenarioError || isSavedScenario) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            scenarioError
              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
              : "border-indigo-500/20 bg-indigo-500/10 text-indigo-100"
          }`}
        >
          {scenarioError ? (
            scenarioError
          ) : isSavedScenario ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{selectedScenario.name}</strong> · desde {formatScenarioDate(selectedScenario.scenario_date)} · escenario guardado en modo solo lectura.
              </span>
              {dateValue(selectedScenario.baseline_snapshot_date) && (
                <span className="text-xs text-indigo-300">
                  Baseline real: {formatScenarioDate(selectedScenario.baseline_snapshot_date)}
                </span>
              )}
            </div>
          ) : (
            scenarioNotice
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-1">
        {[
          ["projections", "📈 Projections"],
          ["goals", "🎯 Goals"],
          ["retirement", "💰 Retirement"],
          ["crypto", "₿ Crypto Cycle"],
          ["montecarlo", "⚡ Monte Carlo"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm transition ${
              activeTab === key
                ? "bg-indigo-500/20 text-indigo-200"
                : "text-slate-400 hover:bg-slate-900 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab !== "projections" ? (
        <section className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-10 text-center">
          <div className="text-4xl">🚧</div>
          <h2 className="mt-4 text-xl font-semibold text-white">Próximamente</h2>
          <p className="mt-2 text-sm text-slate-400">Esta sección va a formar parte del workspace del Planner.</p>
        </section>
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[32px] border border-indigo-500/20 bg-[radial-gradient(circle_at_top_left,rgba(93,124,250,0.28),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:p-8">
            <div className="relative grid grid-cols-1 gap-8 xl:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-indigo-200">Valor proyectado del patrimonio</div>
                <div className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">{compactUsd(baseFinal)}</div>
                <div className="mt-3 text-sm text-slate-300">
                  En {years} años · escenario base · retorno estimado{" "}
                  <span className="font-semibold text-emerald-300">{formatPct(activeBaseReturn)}</span>
                </div>
                <div className="mt-8">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Objetivo FIRE</span>
                    <span>{formatPct(fireProgress)}</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-blue-400 to-emerald-400"
                      style={{ width: `${Math.min(fireProgress, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Objetivo: {compactUsd(fireGoal)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  ["Portfolio inicial", compactUsd(initialCapital), "text-white"],
                  ["Aportes futuros", compactUsd(totalFutureContributions), "text-white"],
                  ["Ganancia proyectada", compactUsd(baseGain), "text-emerald-300"],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
                    <div className={`mt-2 text-xl font-semibold ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-[26px] border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-base font-semibold text-white">Parámetros</h2>
              <p className="mt-1 text-sm text-slate-500">Punto de partida y horizonte.</p>
              <div className="mt-5 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">Portfolio inicial</span>
                  <input type="number" value={initialCapital} disabled={isSavedScenario} onChange={(e) => setInitialCapital(Number(e.target.value))} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">Aporte mensual</span>
                  <input type="number" value={monthlyContribution} disabled={isSavedScenario} onChange={(e) => setMonthlyContribution(Number(e.target.value))} className={inputClass} />
                  <input type="range" min="0" max="8000" step="100" value={monthlyContribution} disabled={isSavedScenario} onChange={(e) => setMonthlyContribution(Number(e.target.value))} className="mt-3 w-full disabled:opacity-50" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">Horizonte: {years} años</span>
                  <input type="range" min="1" max="30" step="1" value={years} disabled={isSavedScenario} onChange={(e) => setYears(Number(e.target.value))} className="w-full disabled:opacity-50" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">Objetivo FIRE</span>
                  <input type="number" value={fireGoal} disabled={isSavedScenario} onChange={(e) => setFireGoal(Number(e.target.value))} className={inputClass} />
                </label>
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Distribución</h2>
                  <p className="mt-1 text-sm text-slate-500">Peso de cada aporte.</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${totalAllocation === 100 ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                  {Number(totalAllocation.toFixed(1))}%
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {assets.map((asset, index) => (
                  <div key={`${asset.rawTicker || asset.ticker}-${index}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AssetAvatar ticker={asset.rawTicker || asset.ticker} normalizedTicker={asset.ticker} size={34} />
                        <div>
                          <div className="text-sm font-medium text-slate-200">{asset.ticker}</div>
                          <div className="text-xs text-slate-500">{asset.name}</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-200">{asset.allocation}%</div>
                    </div>
                    <input type="range" min="0" max="70" step="1" value={asset.allocation} disabled={isSavedScenario} onChange={(e) => updateAsset(index, "allocation", e.target.value)} className="w-full disabled:opacity-50" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-base font-semibold text-white">Rendimientos</h2>
              <p className="mt-1 text-sm text-slate-500">Supuestos anuales por activo.</p>
              <div className="mt-5 space-y-4">
                {assets.map((asset, index) => (
                  <div key={`${asset.rawTicker || asset.ticker}-return-${index}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AssetAvatar ticker={asset.rawTicker || asset.ticker} normalizedTicker={asset.ticker} size={34} />
                        <span className="text-sm text-slate-300">{asset.ticker}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-200">{formatPct(asset.expectedReturn)}</div>
                    </div>
                    <input type="range" min="-20" max="60" step="1" value={asset.expectedReturn} disabled={isSavedScenario} onChange={(e) => updateAsset(index, "expectedReturn", e.target.value)} className="w-full disabled:opacity-50" />
                  </div>
                ))}
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-center">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Retorno ponderado</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-300">{formatPct(activeBaseReturn)}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {scenarios.map((scenario) => {
              const value = chartData[chartData.length - 1]?.[scenario.key] || 0;
              const gain = value - baseContributions;
              return (
                <div key={scenario.key} className={`rounded-[26px] border p-5 ${scenario.key === "base" ? "border-indigo-500/30 bg-indigo-500/10" : "border-slate-800 bg-slate-900/70"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{scenario.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{scenario.description}</div>
                    </div>
                    <div className="rounded-full bg-slate-950 px-3 py-1 text-xs text-slate-300">{formatPct(scenario.returnPct)}</div>
                  </div>
                  <div className="mt-5 text-3xl font-bold text-white">{compactUsd(value)}</div>
                  <div className="mt-2 text-sm text-slate-400">Ganancia estimada: <span className="text-emerald-300">{compactUsd(gain)}</span></div>
                </div>
              );
            })}
          </section>

          <section className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-base font-semibold text-white">Evolución proyectada</h2>
                <p className="mt-1 text-sm text-slate-500">Aportes acumulados vs rendimiento acumulado del escenario base.</p>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs text-slate-400">Objetivo FIRE: {compactUsd(fireGoal)}</div>
            </div>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
                  <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip content={<ProjectionTooltip />} />
                  <Legend />
                  <ReferenceLine y={fireGoal} stroke="#f59e0b" strokeDasharray="6 6" label={{ value: "FIRE", fill: "#fbbf24", fontSize: 12 }} />
                  <Area type="monotone" dataKey="contributions" name="Aportes acumulados" stackId="baseComposition" stroke="#64748b" fill="#64748b" fillOpacity={0.35} />
                  <Area type="monotone" dataKey="baseGain" name="Rendimiento acumulado" stackId="baseComposition" stroke="#22c55e" fill="#22c55e" fillOpacity={0.22} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-base font-semibold text-white">Insights</h2>
              <p className="mt-1 text-sm text-slate-500">Lecturas automáticas del escenario actual.</p>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">✓ {topGrowthAsset?.ticker} es el principal motor esperado del crecimiento del aporte.</div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">✓ Aumentar el aporte mensual en USD 500 sumaría aproximadamente <span className="text-emerald-300">{compactUsd(500 * 12 * years)}</span> en aportes directos antes del rendimiento.</div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">✓ Con este escenario alcanzarías el <span className="text-indigo-300">{formatPct(fireProgress)}</span> del objetivo FIRE.</div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-base font-semibold text-white">Detalle anual</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Año</th>
                      <th className="px-3 py-3 text-right">Aportes</th>
                      <th className="px-3 py-3 text-right">Conservador</th>
                      <th className="px-3 py-3 text-right">Base</th>
                      <th className="px-3 py-3 text-right">Agresivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {chartData.map((row) => (
                      <tr key={row.year} className="text-slate-300">
                        <td className="px-3 py-3 font-medium text-white">{row.year}</td>
                        <td className="px-3 py-3 text-right">{compactUsd(row.contributions)}</td>
                        <td className="px-3 py-3 text-right">{compactUsd(row.conservative)}</td>
                        <td className="px-3 py-3 text-right text-indigo-300">{compactUsd(row.base)}</td>
                        <td className="px-3 py-3 text-right text-emerald-300">{compactUsd(row.aggressive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSaveScenario} className="w-full max-w-lg rounded-[28px] border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-indigo-300">Nuevo escenario</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Guardar proyección</h2>
                <p className="mt-2 text-sm text-slate-400">La comparación Plan vs Real va a comenzar desde la fecha que definas acá.</p>
              </div>
              <button type="button" onClick={() => setSaveModalOpen(false)} className="rounded-xl px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white">✕</button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Nombre</span>
                <input autoFocus required value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Ej. Plan agosto 2026" className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Fecha del escenario</span>
                <input required type="date" value={scenarioDate} onChange={(e) => setScenarioDate(e.target.value)} className={inputClass} />
                <span className="mt-2 block text-xs text-slate-500">Esta fecha es el punto cero del escenario, independientemente de cuándo lo guardes.</span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Descripción</span>
                <textarea rows="4" value={scenarioDescription} onChange={(e) => setScenarioDescription(e.target.value)} placeholder="Tesis, objetivos o supuestos de este plan…" className={`${inputClass} resize-none`} />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setSaveModalOpen(false)} className="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={savingScenario || !scenarioName.trim() || !scenarioDate} className="rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {savingScenario ? "Guardando…" : "Guardar escenario"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
