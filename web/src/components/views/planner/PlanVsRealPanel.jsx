import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../../utils/api";
import { formatCurrency } from "../../../utils/formatters";
import { usePortfolioData } from "../../../context/PortfolioDataContext";

function dateValue(value) {
  return value?.value || value || "";
}

function formatDate(value) {
  const raw = String(dateValue(value) || "").slice(0, 10);
  const [year, month, day] = raw.split("-");
  return day && month && year ? `${day}/${month}/${year}` : raw;
}

function compactUsd(value) {
  if (value == null) return "—";
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `USD ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `USD ${(n / 1_000).toFixed(1)}k`;
  return formatCurrency(n, "USD");
}

function signedUsd(value) {
  if (value == null) return "—";
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${compactUsd(n)}`;
}

function signedPct(value, suffix = "%") {
  if (value == null) return "—";
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}${suffix}`;
}

function metricConfig(metric) {
  if (metric === "performance") {
    return {
      planKey: "plan_performance_pct",
      realKey: "real_performance_pct",
      planName: "Performance plan",
      realName: "Performance real",
      format: (value) => `${Number(value || 0).toFixed(1)}%`,
    };
  }
  if (metric === "contributions") {
    return {
      planKey: "plan_contributions_usd",
      realKey: "real_contributions_usd",
      planName: "Aportes plan",
      realName: "Aportes reales",
      format: compactUsd,
    };
  }
  return {
    planKey: "plan_value_usd",
    realKey: "real_value_usd",
    planName: "Patrimonio plan",
    realName: "Patrimonio real",
    format: compactUsd,
  };
}

function ComparisonTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const config = metricConfig(metric);
  const row = payload[0]?.payload;
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 shadow-xl">
      <div className="mb-3 text-sm font-semibold text-white">{formatDate(label)}</div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-8 text-indigo-300">
          <span>Plan</span><span>{config.format(row?.[config.planKey])}</span>
        </div>
        <div className="flex items-center justify-between gap-8 text-emerald-300">
          <span>Real</span><span>{row?.[config.realKey] == null ? "—" : config.format(row[config.realKey])}</span>
        </div>
      </div>
    </div>
  );
}

export default function PlanVsRealPanel({ scenarioId }) {
  const { fetchCached } = usePortfolioData();
  const [comparison, setComparison] = useState(null);
  const [metric, setMetric] = useState("value");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scenarioId) {
      setComparison(null);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadComparison() {
      try {
        setLoading(true);
        setError("");
        setComparison(null);
        const body = await fetchCached(`planner:comparison:${scenarioId}`, async () => {
          const response = await apiFetch(`/api/planner/scenarios/${scenarioId}/comparison`);
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
          return result;
        }, { ttlMs: 5 * 60 * 1000 });
        if (!cancelled) setComparison(body);
      } catch (e) {
        if (!cancelled) setError(e.message || "No se pudo cargar Plan vs Real.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadComparison();
    return () => { cancelled = true; };
  }, [scenarioId, fetchCached]);

  const config = metricConfig(metric);
  const visibleSeries = useMemo(
    () => (comparison?.series || []).filter((row) => row.real_value_usd != null),
    [comparison]
  );
  const summary = comparison?.summary;
  const hasHistory = visibleSeries.length >= 2;

  if (!scenarioId) return null;

  return (
    <section className="rounded-[30px] border border-indigo-500/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)] md:p-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.26em] text-indigo-300">Seguimiento del plan</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Plan vs Real</h2>
        <p className="mt-1 text-sm text-slate-400">
          Separá cuánto del resultado viene de performance, cuánto de aportes y cuánto se refleja en patrimonio.
        </p>
        {comparison?.scenario && (
          <div className="mt-3 inline-flex rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200">
            {comparison.scenario.name} · desde {formatDate(comparison.scenario.scenario_date)}
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : loading ? (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-8 text-center text-sm text-slate-400">Cargando comparación…</div>
      ) : comparison && summary ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Patrimonio</div>
              <div className="mt-2 text-2xl font-semibold text-white">{signedPct(summary.value_delta_pct)}</div>
              <div className="mt-2 text-xs text-slate-400">Real {compactUsd(summary.real_value_usd)} · Plan {compactUsd(summary.plan_value_usd)}</div>
              <div className="mt-1 text-xs text-indigo-300">Diferencia {signedUsd(summary.value_delta_usd)}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Performance</div>
              <div className="mt-2 text-2xl font-semibold text-white">{signedPct(summary.performance_delta_pp, " pp")}</div>
              <div className="mt-2 text-xs text-slate-400">Real {signedPct(summary.real_performance_pct)} · Plan {signedPct(summary.plan_performance_pct)}</div>
              <div className="mt-1 text-xs text-slate-500">Rendimiento neutralizado por flujos</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Aportes</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {summary.contributions_fulfillment_pct == null ? "—" : `${Number(summary.contributions_fulfillment_pct).toFixed(0)}% del plan`}
              </div>
              <div className="mt-2 text-xs text-slate-400">Real {compactUsd(summary.real_contributions_usd)} · Plan {compactUsd(summary.plan_contributions_usd)}</div>
              <div className="mt-1 text-xs text-indigo-300">Diferencia {signedUsd(summary.contributions_delta_usd)}</div>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-800 pt-5">
            {hasHistory ? (
              <>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <div className="text-sm font-semibold text-white">Evolución desde {formatDate(comparison.scenario?.scenario_date)}</div>
                    <div className="mt-1 text-xs text-slate-500">Último punto comparable: {formatDate(summary.as_of)}</div>
                  </div>
                  <div className="inline-flex w-fit rounded-xl border border-slate-800 bg-slate-950 p-1">
                    {[["value", "Patrimonio"], ["performance", "Performance"], ["contributions", "Aportes"]].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setMetric(key)} className={`rounded-lg px-3 py-2 text-xs transition ${metric === key ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:text-white"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={visibleSeries} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
                      <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#94a3b8", fontSize: 11 }} minTickGap={28} />
                      <YAxis tickFormatter={(value) => metric === "performance" ? `${Number(value).toFixed(0)}%` : compactUsd(value).replace("USD ", "$")} tick={{ fill: "#94a3b8", fontSize: 11 }} width={70} />
                      <Tooltip content={<ComparisonTooltip metric={metric} />} />
                      <Legend />
                      <Line type="monotone" dataKey={config.planKey} name={config.planName} stroke="#818cf8" strokeWidth={2.5} dot={false} connectNulls />
                      <Line type="monotone" dataKey={config.realKey} name={config.realName} stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-7 text-center">
                <div className="text-sm font-semibold text-white">Seguimiento iniciado el {formatDate(comparison.scenario?.scenario_date)}</div>
                <div className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
                  El baseline ya quedó congelado. Todavía no hay un segundo período comparable; cuando aparezca, el gráfico Plan vs Real se mostrará automáticamente.
                </div>
              </div>
            )}
          </div>

          {comparison.methodology?.partial_first_month_included === false && (
            <div className="mt-3 text-xs text-slate-500">
              Performance y aportes usan períodos mensuales completos posteriores a la fecha del escenario; el mes parcial inicial no se atribuye al plan.
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-6 text-center text-sm text-slate-400">Todavía no hay datos comparables.</div>
      )}
    </section>
  );
}
