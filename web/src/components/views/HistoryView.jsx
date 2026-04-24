import { useEffect, useMemo, useState } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
} from "recharts";

const RANGE_OPTIONS = ["1M", "3M", "6M", "YTD", "1A", "MAX"];
const METRIC_OPTIONS = ["TOTAL", "INVESTMENTS", "PNL"];

function formatCurrency(value, currency = "USD") {
    if (value == null || isNaN(value)) return "-";

    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(Number(value));
}

function formatPercentFromDecimal(value) {
    if (value == null || isNaN(value)) return "-";
    return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatShortDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
    }).format(date);
}

function formatLongDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

function HistoryKpiCard({ label, value, subvalue, positive }) {
    return (
        <div className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,18,40,0.96)_0%,rgba(6,10,28,0.98)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {label}
            </div>

            <div
                className={`mt-4 text-[30px] font-semibold ${positive === undefined
                        ? "text-white"
                        : positive
                            ? "text-emerald-400"
                            : "text-red-400"
                    }`}
            >
                {value}
            </div>

            {subvalue ? (
                <div className="mt-2 text-[14px] text-slate-400">{subvalue}</div>
            ) : null}
        </div>
    );
}

function CustomTooltip({ active, payload, label, metric }) {
    if (!active || !payload || !payload.length) return null;

    const row = payload[0].payload;

    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-xl">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                {formatLongDate(label)}
            </div>

            {metric === "INVESTMENTS" ? (
                <div className="mt-3 space-y-2">
                    <div>
                        <div className="text-sm text-slate-300">Valor actual</div>
                        <div className="text-lg font-semibold text-white">
                            {formatCurrency(row.investments_usd, "USD")}
                        </div>
                    </div>

                    <div>
                        <div className="text-sm text-slate-300">Costo</div>
                        <div className="text-lg font-semibold text-white">
                            {formatCurrency(row.investments_cost_usd, "USD")}
                        </div>
                    </div>

                    <div>
                        <div className="text-sm text-slate-400">Brecha</div>
                        <div
                            className={`text-sm font-medium ${Number(row.investments_usd || 0) -
                                    Number(row.investments_cost_usd || 0) >=
                                    0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                        >
                            {formatCurrency(
                                Number(row.investments_usd || 0) -
                                Number(row.investments_cost_usd || 0),
                                "USD"
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mt-3 text-sm text-slate-300">
                        {metric === "TOTAL" ? "Valor total" : "PnL"}
                    </div>

                    <div className="text-lg font-semibold text-white">
                        {metric === "TOTAL"
                            ? formatCurrency(row.market_value_usd, "USD")
                            : formatCurrency(row.total_pnl_usd, "USD")}
                    </div>

                    {metric === "PNL" && (
                        <div className="mt-1 text-sm text-slate-400">
                            {formatPercentFromDecimal(row.total_pnl_pct)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function BenchmarkTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;

    const row = payload[0].payload;

    const portfolioReturn = Number(row.investmentsIndex || 0) - 100;
    const benchmarkReturn = Number(row.benchmarkIndex || 0) - 100;
    const alpha = Number(row.alpha || 0);

    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-xl">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                {formatLongDate(label)}
            </div>

            <div className="mt-3 space-y-2">
                <div>
                    <div className="text-sm text-slate-300">Portfolio</div>
                    <div className="text-lg font-semibold text-white">
                        {portfolioReturn >= 0 ? "+" : ""}
                        {portfolioReturn.toFixed(2)}%
                    </div>
                </div>

                <div>
                    <div className="text-sm text-slate-300">Benchmark</div>
                    <div className="text-lg font-semibold text-white">
                        {benchmarkReturn >= 0 ? "+" : ""}
                        {benchmarkReturn.toFixed(2)}%
                    </div>
                </div>

                <div>
                    <div className="text-sm text-slate-400">Alpha</div>
                    <div
                        className={`text-sm font-medium ${alpha >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                    >
                        {alpha >= 0 ? "+" : ""}
                        {alpha.toFixed(2)}%
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function HistoryView() {
    const [range, setRange] = useState("6M");
    const [metric, setMetric] = useState("INVESTMENTS");
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    const [historyMode, setHistoryMode] = useState("evolution");
    const [benchmarkCode, setBenchmarkCode] = useState("SPY");
    const [benchmarkSeries, setBenchmarkSeries] = useState([]);
    const [benchmarkLoading, setBenchmarkLoading] = useState(false);

    useEffect(() => {
        async function loadHistory() {
            try {
                setLoading(true);
                const res = await fetch(`/api/portfolio/history?range=${range}`);
                const data = await res.json();
                setHistory(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Error loading history:", error);
                setHistory([]);
            } finally {
                setLoading(false);
            }
        }

        loadHistory();
    }, [range]);

    useEffect(() => {
        async function loadBenchmark() {
            try {
                setBenchmarkLoading(true);

                const res = await fetch(
                    `/api/portfolio/benchmark?code=${benchmarkCode}&range=${range}`
                );
                const data = await res.json();

                const normalized = (data.rows || []).map((row) => ({
                    date: row.snapshot_date?.value ?? row.snapshot_date,
                    investmentsIndex: Number(row.investments_index || 0),
                    benchmarkIndex: Number(row.benchmark_index || 0),
                    alpha: Number(row.relative_alpha_index || 0),
                    investmentsUsd: Number(row.investments_usd || 0),
                    benchmarkPrice: Number(row.close_price_usd || 0),
                    benchmarkCode: row.benchmark_code,
                }));

                setBenchmarkSeries(normalized);
            } catch (error) {
                console.error("Error loading benchmark:", error);
                setBenchmarkSeries([]);
            } finally {
                setBenchmarkLoading(false);
            }
        }

        if (historyMode === "benchmark") {
            loadBenchmark();
        }
    }, [historyMode, benchmarkCode, range]);

    const chartData = useMemo(() => {
        return history.map((row) => ({
            snapshot_date: row.snapshot_date?.value ?? row.snapshot_date,
            market_value_usd:
                row.market_value_usd == null || row.market_value_usd === ""
                    ? null
                    : Number(row.market_value_usd),
            cost_value_usd:
                row.cost_value_usd == null || row.cost_value_usd === ""
                    ? null
                    : Number(row.cost_value_usd),
            investments_usd:
                row.investments_usd == null || row.investments_usd === ""
                    ? null
                    : Number(row.investments_usd),
            investments_cost_usd:
                row.investments_cost_usd == null || row.investments_cost_usd === ""
                    ? null
                    : Number(row.investments_cost_usd),
            total_pnl_usd:
                row.total_pnl_usd == null || row.total_pnl_usd === ""
                    ? null
                    : Number(row.total_pnl_usd),
            total_pnl_pct:
                row.total_pnl_pct == null || row.total_pnl_pct === ""
                    ? null
                    : Number(row.total_pnl_pct),
        }));
    }, [history]);

    const metricConfig = {
        TOTAL: {
            key: "market_value_usd",
            color: "#7c83ff",
            label: "Valor total USD",
            kpiLabel: "Valor actual",
        },
        INVESTMENTS: {
            key: "investments_usd",
            color: "#60a5fa",
            secondaryKey: "investments_cost_usd",
            secondaryColor: "#f59e0b",
            label: "Investments vs costo",
            kpiLabel: "Investments actuales",
        },
        PNL: {
            key: "total_pnl_usd",
            color: "#18C29C",
            label: "PnL USD",
            kpiLabel: "PnL actual",
        },
    };

    const activeMetric = metricConfig[metric];
    const dataKey = activeMetric.key;
    const strokeColor = activeMetric.color;

    const firstRow = chartData[0] || null;
    const lastRow = chartData[chartData.length - 1] || null;

    const firstValue = firstRow ? Number(firstRow[dataKey] || 0) : 0;
    const lastValue = lastRow ? Number(lastRow[dataKey] || 0) : 0;

    const periodChangeUsd = lastValue - firstValue;
    const periodChangePct =
        firstRow && firstValue !== 0 ? periodChangeUsd / firstValue : 0;

    const pnlPositive = Number(lastRow?.total_pnl_usd || 0) >= 0;
    const periodPositive = periodChangeUsd >= 0;

    const investmentsPeriodChangeUsd =
        Number(lastRow?.investments_usd || 0) -
        Number(firstRow?.investments_usd || 0);

    const investmentsCostPeriodChangeUsd =
        Number(lastRow?.investments_cost_usd || 0) -
        Number(firstRow?.investments_cost_usd || 0);

    const investmentsPeriodPositive = investmentsPeriodChangeUsd >= 0;
    const investmentsCostPeriodPositive = investmentsCostPeriodChangeUsd >= 0;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div className="text-[12px] uppercase tracking-[0.28em] text-slate-500">
                        Histórico
                    </div>
                    <h2 className="mt-3 text-4xl font-semibold text-white">
                        Evolución del portfolio
                    </h2>
                    <p className="mt-3 text-slate-400">
                        Seguimiento del valor total, investments y rendimiento.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <HistoryKpiCard
                    label={activeMetric.kpiLabel}
                    value={formatCurrency(lastValue, "USD")}
                    positive={metric === "PNL" ? pnlPositive : undefined}
                />

                <HistoryKpiCard
                    label="Variación período"
                    value={
                        metric === "INVESTMENTS" ? (
                            <div className="space-y-1">
                                <div
                                    className={
                                        investmentsPeriodPositive
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                    }
                                >
                                    Valor: {investmentsPeriodPositive ? "+" : ""}
                                    {formatCurrency(investmentsPeriodChangeUsd, "USD")}
                                </div>
                            </div>
                        ) : (
                            `${periodPositive ? "+" : ""}${formatCurrency(
                                periodChangeUsd,
                                "USD"
                            )}`
                        )
                    }
                    subvalue={
                        metric === "INVESTMENTS" ? (
                            <span
                                className={
                                    investmentsCostPeriodPositive
                                        ? "text-emerald-400"
                                        : "text-red-400"
                                }
                            >
                                Costo: {investmentsCostPeriodPositive ? "+" : ""}
                                {formatCurrency(investmentsCostPeriodChangeUsd, "USD")}
                            </span>
                        ) : (
                            formatPercentFromDecimal(periodChangePct)
                        )
                    }
                    positive={metric === "INVESTMENTS" ? undefined : periodPositive}
                />

                <HistoryKpiCard
                    label="PnL actual"
                    value={formatCurrency(lastRow?.total_pnl_usd, "USD")}
                    subvalue={formatPercentFromDecimal(lastRow?.total_pnl_pct)}
                    positive={pnlPositive}
                />
            </div>

            <div className="rounded-[24px] border border-slate-800/80 p-6">
                <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <div className="text-xs uppercase text-slate-500">
                            {historyMode === "benchmark"
                                ? "Portfolio vs benchmark"
                                : activeMetric.label}
                        </div>
                        <div className="text-xl text-white font-semibold">
                            {historyMode === "benchmark" ? "Performance relativa" : "Evolución"}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="flex gap-2">
                            {RANGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setRange(opt)}
                                    className={`px-3 py-1.5 rounded-lg text-xs ${opt === range
                                            ? "bg-indigo-500/20 text-white"
                                            : "bg-white/5 text-slate-300"
                                        }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>

                        <div className="flex rounded-2xl bg-slate-950/60 p-1">
                            <button
                                onClick={() => setHistoryMode("evolution")}
                                className={`rounded-xl px-4 py-2 text-sm transition ${historyMode === "evolution"
                                        ? "bg-indigo-500/20 text-white"
                                        : "text-slate-400 hover:text-white"
                                    }`}
                            >
                                Evolución
                            </button>

                            <button
                                onClick={() => setHistoryMode("benchmark")}
                                className={`rounded-xl px-4 py-2 text-sm transition ${historyMode === "benchmark"
                                        ? "bg-indigo-500/20 text-white"
                                        : "text-slate-400 hover:text-white"
                                    }`}
                            >
                                Benchmark
                            </button>
                        </div>

                        {historyMode === "evolution" && (
                            <div className="flex gap-2">
                                {METRIC_OPTIONS.map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setMetric(opt)}
                                        className={`px-3 py-1.5 rounded-lg text-xs ${opt === metric
                                                ? "bg-emerald-500/20 text-white"
                                                : "bg-white/5 text-slate-300"
                                            }`}
                                    >
                                        {opt === "TOTAL"
                                            ? "Total"
                                            : opt === "INVESTMENTS"
                                                ? "Investments"
                                                : "PnL"}
                                    </button>
                                ))}
                            </div>
                        )}

                        {historyMode === "benchmark" && (
                            <select
                                value={benchmarkCode}
                                onChange={(e) => setBenchmarkCode(e.target.value)}
                                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                            >
                                <option value="SPY">SPY - S&P 500</option>
                                <option value="QQQ">QQQ - Nasdaq 100</option>
                                <option value="BTC">BTC - Bitcoin</option>
                            </select>
                        )}
                    </div>
                </div>

                <div className="h-[420px]">
                    {historyMode === "evolution" ? (
                        <ResponsiveContainer>
                            <LineChart data={chartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="snapshot_date"
                                    tickFormatter={formatShortDate}
                                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={["dataMin - 2000", "dataMax + 2000"]}
                                    tickFormatter={(value) => Number(value).toLocaleString("es-AR")}
                                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={90}
                                />
                                <Tooltip content={<CustomTooltip metric={metric} />} />

                                {metric === "INVESTMENTS" && (
                                    <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: "12px" }} />
                                )}

                                <Line
                                    type="monotone"
                                    dataKey={dataKey}
                                    stroke={strokeColor}
                                    strokeWidth={3}
                                    dot={{ r: 4 }}
                                    isAnimationActive={false}
                                    name={
                                        metric === "INVESTMENTS"
                                            ? "Valor actual"
                                            : activeMetric.label
                                    }
                                />

                                {metric === "INVESTMENTS" && (
                                    <Line
                                        type="monotone"
                                        dataKey={activeMetric.secondaryKey}
                                        stroke={activeMetric.secondaryColor}
                                        strokeWidth={3}
                                        dot={{ r: 4 }}
                                        isAnimationActive={false}
                                        name="Costo"
                                    />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <ResponsiveContainer width="100%" height={420}>
                            <LineChart data={benchmarkSeries}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(148,163,184,0.12)"
                                />

                                <XAxis
                                    dataKey="date"
                                    tickFormatter={formatShortDate}
                                    tick={{ fill: "#93c5fd", fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />

                                <YAxis
                                    tick={{ fill: "#93c5fd", fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={["dataMin - 2", "dataMax + 2"]}
                                    tickFormatter={(value) =>
                                        `${(Number(value) - 100).toFixed(0)}%`
                                    }
                                />

                                <Tooltip content={<BenchmarkTooltip />} />

                                <Legend />

                                <Line
                                    type="monotone"
                                    dataKey="investmentsIndex"
                                    name="Portfolio"
                                    stroke="#60a5fa"
                                    strokeWidth={3}
                                    dot={false}
                                />

                                <Line
                                    type="monotone"
                                    dataKey="benchmarkIndex"
                                    name={`${benchmarkCode} benchmark`}
                                    stroke="#f59e0b"
                                    strokeWidth={3}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {(loading || benchmarkLoading) && (
                <div className="text-sm text-slate-500">Cargando histórico...</div>
            )}
        </div>
    );
}