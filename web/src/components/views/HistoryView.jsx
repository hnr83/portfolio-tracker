import { Fragment, useEffect, useMemo, useState } from "react";
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
const PERFORMANCE_TABS = ["CALENDAR", "VINTAGE"];
const MONTH_NAMES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function apiFetch(path, options = {}) {
    if (!API_BASE_URL) {
        throw new Error("Falta configurar VITE_API_BASE_URL");
    }

    const token = window.localStorage.getItem("portfolio-auth-token");

    return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
}

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
        <div className="rounded-2xl border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,18,40,0.96)_0%,rgba(6,10,28,0.98)_100%)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-sm md:rounded-[22px] md:p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 md:text-[11px] md:tracking-[0.24em]">
                {label}
            </div>

            <div
                className={`mt-3 text-xl font-semibold md:mt-4 md:text-[30px] ${positive === undefined
                        ? "text-white"
                        : positive
                            ? "text-emerald-400"
                            : "text-red-400"
                    }`}
            >
                {value}
            </div>

            {subvalue ? (
                <div className="mt-1 text-xs text-slate-400 md:mt-2 md:text-[14px]">
                    {subvalue}
                </div>
            ) : null}
        </div>
    );
}

function CustomTooltip({ active, payload, label, metric }) {
    if (!active || !payload || !payload.length) return null;

    const row = payload[0].payload;

    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur">
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {formatLongDate(label)}
            </div>

            {metric === "INVESTMENTS" ? (
                <div className="mt-2 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-6">
                        <span className="text-slate-400">Valor</span>

                        <span className="font-semibold text-white">
                            {formatCurrency(row.investments_usd, "USD")}
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-6">
                        <span className="text-slate-400">Costo</span>

                        <span className="font-semibold text-white">
                            {formatCurrency(row.investments_cost_usd, "USD")}
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-6">
                        <span className="text-slate-400">PnL</span>

                        <span
                            className={`font-semibold ${Number(row.investments_usd || 0) -
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
                        </span>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mt-3 text-sm text-slate-300">
                        {metric === "TOTAL" ? "Valor total" : "PnL"}
                    </div>

                    <div className="text-lg font-semibold text-white">
                        {metric === "TOTAL"
                            ? formatCurrency(
                                row.total_with_trading_usd ?? row.market_value_usd,
                                "USD"
                            )
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
        <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {formatLongDate(label)}
            </div>

            <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-6">
                    <span className="text-slate-400">Portfolio</span>
                    <span className="font-semibold text-white">
                        {portfolioReturn >= 0 ? "+" : ""}
                        {portfolioReturn.toFixed(2)}%
                    </span>
                </div>

                <div className="flex items-center justify-between gap-6">
                    <span className="text-slate-400">Benchmark</span>
                    <span className="font-semibold text-white">
                        {benchmarkReturn >= 0 ? "+" : ""}
                        {benchmarkReturn.toFixed(2)}%
                    </span>
                </div>

                <div className="flex items-center justify-between gap-6">
                    <span className="text-slate-400">Alpha</span>
                    <span
                        className={`font-semibold ${alpha >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                    >
                        {alpha >= 0 ? "+" : ""}
                        {alpha.toFixed(2)}%
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function HistoryView() {
    const [range, setRange] = useState("YTD");
    const [metric, setMetric] = useState("INVESTMENTS");
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    const [historyMode, setHistoryMode] = useState("evolution");
    const [benchmarkCode, setBenchmarkCode] = useState("SPY");
    const [benchmarkSeries, setBenchmarkSeries] = useState([]);
    const [benchmarkLoading, setBenchmarkLoading] = useState(false);

    const [performanceTab, setPerformanceTab] = useState("CALENDAR");
    const [historicalPerformance, setHistoricalPerformance] = useState([]);
    const [vintageReturns, setVintageReturns] = useState([]);
    const [expandedYears, setExpandedYears] = useState({});

    useEffect(() => {
        async function loadHistory() {
            try {
                setLoading(true);
                const res = await apiFetch(`/api/portfolio/history?range=${range}`);
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

                const res = await apiFetch(
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

    useEffect(() => {
        async function loadPerformanceTables() {
            try {
                const [calendarRes, vintageRes] = await Promise.all([
                    apiFetch("/api/portfolio/historical-performance"),
                    apiFetch("/api/portfolio/vintage-returns"),
                ]);

                const calendarData = await calendarRes.json();
                const vintageData = await vintageRes.json();

                setHistoricalPerformance(
                    Array.isArray(calendarData) ? calendarData : []
                );
                setVintageReturns(Array.isArray(vintageData) ? vintageData : []);
            } catch (error) {
                console.error("Error loading performance tables:", error);
                setHistoricalPerformance([]);
                setVintageReturns([]);
            }
        }

        loadPerformanceTables();
    }, []);

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

    const investmentsCagr = useMemo(() => {
        if (!["1A", "MAX"].includes(range)) return null;

        const monthlyReturns = historicalPerformance
            .flatMap((yearRow) =>
                (yearRow.months || []).map((month) => ({
                    startDate: month.start_date?.value ?? month.start_date,
                    endDate: month.end_date?.value ?? month.end_date,
                    performance: Number(month.adjusted_performance_pct),
                }))
            )
            .filter(
                (month) =>
                    month.startDate &&
                    month.endDate &&
                    Number.isFinite(month.performance)
            )
            .sort((a, b) => a.endDate.localeCompare(b.endDate));

        if (!monthlyReturns.length) return null;

        const lastDate = new Date(
            `${monthlyReturns[monthlyReturns.length - 1].endDate}T00:00:00`
        );

        const selectedMonths =
            range === "MAX"
                ? monthlyReturns
                : monthlyReturns.filter((month) => {
                    const cutoff = new Date(lastDate);
                    cutoff.setFullYear(cutoff.getFullYear() - 1);
                    return new Date(`${month.endDate}T00:00:00`) > cutoff;
                });

        if (!selectedMonths.length) return null;

        const growthFactor = selectedMonths.reduce(
            (factor, month) => factor * (1 + month.performance),
            1
        );

        if (growthFactor <= 0) return null;

        const firstDate = new Date(`${selectedMonths[0].startDate}T00:00:00`);
        const finalDate = new Date(
            `${selectedMonths[selectedMonths.length - 1].endDate}T00:00:00`
        );
        const days = Math.max(
            1,
            (finalDate - firstDate) / (1000 * 60 * 60 * 24)
        );

        return Math.pow(growthFactor, 365 / days) - 1;
    }, [historicalPerformance, range]);

    function toggleYear(year) {
        setExpandedYears((prev) => ({
            ...prev,
            [year]: !prev[year],
        }));
    }

    return (
        <div className="space-y-5 md:space-y-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500 md:text-[12px] md:tracking-[0.28em]">
                        Histórico
                    </div>

                    <h2 className="mt-2 text-2xl font-semibold text-white md:mt-3 md:text-4xl">
                        Evolución del portfolio
                    </h2>

                    <p className="mt-2 text-sm text-slate-400 md:mt-3 md:text-base">
                        Seguimiento del valor total, investments y rendimiento.
                    </p>
                </div>
            </div>

            <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
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

                {metric === "INVESTMENTS" ? (
                    <HistoryKpiCard
                        label="CAGR anualizado"
                        value={
                            investmentsCagr == null
                                ? "—"
                                : `${investmentsCagr >= 0 ? "+" : ""}${formatPercentFromDecimal(
                                    investmentsCagr
                                )}`
                        }
                        subvalue={
                            investmentsCagr == null
                                ? "Disponible para 1A y MAX"
                                : range === "MAX"
                                    ? "Desde inicio · ajustado por aportes"
                                    : "Último año · ajustado por aportes"
                        }
                        positive={
                            investmentsCagr == null
                                ? undefined
                                : investmentsCagr >= 0
                        }
                    />
                ) : (
                    <HistoryKpiCard
                        label="PnL actual"
                        value={formatCurrency(lastRow?.total_pnl_usd, "USD")}
                        subvalue={formatPercentFromDecimal(lastRow?.total_pnl_pct)}
                        positive={pnlPositive}
                    />
                )}
            </div>

            <div className="rounded-2xl border border-slate-800/80 p-4 md:rounded-[24px] md:p-6">
                <div className="mb-4 flex flex-col gap-4 md:mb-6 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <div className="text-[11px] uppercase text-slate-500 md:text-xs">
                            {historyMode === "benchmark"
                                ? "Portfolio vs benchmark"
                                : activeMetric.label}
                        </div>

                        <div className="text-lg font-semibold text-white md:text-xl">
                            {historyMode === "benchmark"
                                ? "Performance relativa"
                                : "Evolución"}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                            {RANGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setRange(opt)}
                                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${opt === range
                                            ? "bg-indigo-500/20 text-white"
                                            : "bg-white/5 text-slate-300"
                                        }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 rounded-2xl bg-slate-950/60 p-1 md:flex">
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
                            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                                {METRIC_OPTIONS.map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setMetric(opt)}
                                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs ${opt === metric
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

                <div className="h-[300px] md:h-[420px]">
                    {historyMode === "evolution" ? (
                        <ResponsiveContainer>
                            <LineChart
                                data={chartData}
                                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                            >
                                <CartesianGrid stroke="rgba(255,255,255,0.05)" />

                                <XAxis
                                    dataKey="snapshot_date"
                                    tickFormatter={formatShortDate}
                                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={24}
                                />

                                <YAxis
                                    domain={["dataMin - 2000", "dataMax + 2000"]}
                                    tickFormatter={(value) =>
                                        Number(value).toLocaleString("es-AR", {
                                            maximumFractionDigits: 0,
                                        })
                                    }
                                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={64}
                                />

                                <Tooltip content={<CustomTooltip metric={metric} />} />

                                {metric === "INVESTMENTS" && (
                                    <Legend
                                        wrapperStyle={{
                                            color: "#cbd5e1",
                                            fontSize: "12px",
                                        }}
                                    />
                                )}

                                <Line
                                    type="monotone"
                                    dataKey={dataKey}
                                    stroke={strokeColor}
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 4 }}
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
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                        isAnimationActive={false}
                                        name="Costo"
                                    />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={benchmarkSeries}
                                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(148,163,184,0.12)"
                                />

                                <XAxis
                                    dataKey="date"
                                    tickFormatter={formatShortDate}
                                    tick={{ fill: "#93c5fd", fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={24}
                                />

                                <YAxis
                                    tick={{ fill: "#93c5fd", fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={["dataMin - 2", "dataMax + 2"]}
                                    tickFormatter={(value) =>
                                        `${(Number(value) - 100).toFixed(0)}%`
                                    }
                                    width={56}
                                />

                                <Tooltip content={<BenchmarkTooltip />} />

                                <Legend
                                    wrapperStyle={{
                                        color: "#cbd5e1",
                                        fontSize: "12px",
                                    }}
                                />

                                <Line
                                    type="monotone"
                                    dataKey="investmentsIndex"
                                    name="Portfolio"
                                    stroke="#60a5fa"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />

                                <Line
                                    type="monotone"
                                    dataKey="benchmarkIndex"
                                    name={`${benchmarkCode} benchmark`}
                                    stroke="#f59e0b"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            <div className="rounded-2xl border border-slate-800/80 p-4 md:rounded-[24px] md:p-6">
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500 md:text-xs">
                            Performance histórica
                        </div>

                        <div className="mt-1 text-lg font-semibold text-white md:text-xl">
                            {performanceTab === "CALENDAR"
                                ? "Retorno calendario ajustado (TWR)"
                                : "Retorno por año invertido a hoy"}
                        </div>

                        <p className="mt-2 max-w-3xl text-sm text-slate-400">
                            {performanceTab === "CALENDAR"
                                ? "Mide cómo rindió el portfolio durante cada año, ajustando los aportes del período."
                                : "Mide cómo rinden hoy las compras realizadas en cada año, usando lotes FIFO abiertos."}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 rounded-2xl bg-slate-950/60 p-1 md:flex">
                        {PERFORMANCE_TABS.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setPerformanceTab(tab)}
                                className={`rounded-xl px-4 py-2 text-sm transition ${performanceTab === tab
                                        ? "bg-cyan-500/20 text-white"
                                        : "text-slate-400 hover:text-white"
                                    }`}
                            >
                                {tab === "CALENDAR" ? "Calendario" : "Año invertido"}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {performanceTab === "CALENDAR" ? (
                        <table className="min-w-full border-separate border-spacing-y-2">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <th className="px-3 py-2">Año</th>
                                    <th className="px-3 py-2">TWR</th>
                                    <th className="px-3 py-2">PnL</th>
                                    <th className="px-3 py-2">Aportes</th>
                                    <th className="px-3 py-2">Portfolio cierre</th>
                                </tr>
                            </thead>

                            <tbody>
                                {historicalPerformance.map((row) => {
                                    const expanded = expandedYears[row.year];

                                    return (
                                        <Fragment key={row.year}>
                                            <tr
                                                onClick={() => toggleYear(row.year)}
                                                className="cursor-pointer rounded-2xl bg-white/[0.03] transition hover:bg-white/[0.05]"
                                            >
                                                <td className="rounded-l-2xl px-3 py-4 font-semibold text-white">
                                                    <div className="flex items-center gap-2">
                                                        <span>
                                                            {expanded ? "▼" : "▶"}
                                                        </span>

                                                        <span>{row.year}</span>
                                                    </div>
                                                </td>

                                                <td
                                                    className={`px-3 py-4 font-semibold ${Number(row.twr_performance_pct) >=
                                                            0
                                                            ? "text-emerald-400"
                                                            : "text-red-400"
                                                        }`}
                                                >
                                                    {formatPercentFromDecimal(
                                                        row.twr_performance_pct
                                                    )}
                                                </td>

                                                <td
                                                    className={`px-3 py-4 ${Number(
                                                        row.total_adjusted_pnl_usd
                                                    ) >= 0
                                                            ? "text-emerald-400"
                                                            : "text-red-400"
                                                        }`}
                                                >
                                                    {formatCurrency(
                                                        row.total_adjusted_pnl_usd,
                                                        "USD"
                                                    )}
                                                </td>

                                                <td className="px-3 py-4 text-slate-300">
                                                    {formatCurrency(
                                                        row.net_asset_flow_usd,
                                                        "USD"
                                                    )}
                                                </td>

                                                <td className="rounded-r-2xl px-3 py-4 text-white">
                                                    {formatCurrency(
                                                        row.approx_end_value_usd,
                                                        "USD"
                                                    )}
                                                </td>
                                            </tr>

                                            {expanded &&
                                                [...(row.months || [])]
                                                    .sort(
                                                        (a, b) =>
                                                            Number(a.month) -
                                                            Number(b.month)
                                                    )
                                                    .map((month) => (
                                                        <tr
                                                            key={`${row.year}-${month.month}`}
                                                            className="bg-slate-950/40 text-sm"
                                                        >
                                                            <td className="px-8 py-3 text-slate-300">
                                                                {
                                                                    MONTH_NAMES[
                                                                    Number(
                                                                        month.month
                                                                    ) - 1
                                                                    ]
                                                                }
                                                            </td>

                                                            <td
                                                                className={`px-3 py-3 ${Number(
                                                                    month.adjusted_performance_pct
                                                                ) >= 0
                                                                        ? "text-emerald-400"
                                                                        : "text-red-400"
                                                                    }`}
                                                            >
                                                                {formatPercentFromDecimal(
                                                                    month.adjusted_performance_pct
                                                                )}
                                                            </td>

                                                            <td
                                                                className={`px-3 py-3 ${Number(
                                                                    month.adjusted_pnl_usd
                                                                ) >= 0
                                                                        ? "text-emerald-400"
                                                                        : "text-red-400"
                                                                    }`}
                                                            >
                                                                {formatCurrency(
                                                                    month.adjusted_pnl_usd,
                                                                    "USD"
                                                                )}
                                                            </td>

                                                            <td className="px-3 py-3 text-slate-400">
                                                                {formatCurrency(
                                                                    month.net_asset_flow_usd,
                                                                    "USD"
                                                                )}
                                                            </td>

                                                            <td className="px-3 py-3 text-slate-300">
                                                                {formatCurrency(
                                                                    month.end_value_usd,
                                                                    "USD"
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <table className="min-w-full border-separate border-spacing-y-2">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <th className="px-3 py-2">Año compra</th>
                                    <th className="px-3 py-2">Invertido</th>
                                    <th className="px-3 py-2">Valor actual</th>
                                    <th className="px-3 py-2">PnL</th>
                                    <th className="px-3 py-2">Return</th>
                                    <th className="px-3 py-2">Activos</th>
                                </tr>
                            </thead>

                            <tbody>
                                {vintageReturns.map((row) => (
                                    <tr
                                        key={row.buy_year}
                                        className="rounded-2xl bg-white/[0.03] transition hover:bg-white/[0.05]"
                                    >
                                        <td className="rounded-l-2xl px-3 py-4 font-semibold text-white">
                                            {row.buy_year}
                                        </td>

                                        <td className="px-3 py-4 text-slate-300">
                                            {formatCurrency(row.invested_usd, "USD")}
                                        </td>

                                        <td className="px-3 py-4 text-white">
                                            {formatCurrency(
                                                row.current_value_usd,
                                                "USD"
                                            )}
                                        </td>

                                        <td
                                            className={`px-3 py-4 ${Number(row.pnl_usd) >= 0
                                                    ? "text-emerald-400"
                                                    : "text-red-400"
                                                }`}
                                        >
                                            {formatCurrency(row.pnl_usd, "USD")}
                                        </td>

                                        <td
                                            className={`px-3 py-4 font-semibold ${Number(row.pnl_pct) >= 0
                                                    ? "text-emerald-400"
                                                    : "text-red-400"
                                                }`}
                                        >
                                            {formatPercentFromDecimal(row.pnl_pct)}
                                        </td>

                                        <td className="rounded-r-2xl px-3 py-4 text-slate-400">
                                            {Number(row.assets_count || 0)} activos ·{" "}
                                            {Number(row.lots_count || 0)} lotes
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {(loading || benchmarkLoading) && (
                <div className="text-sm text-slate-500">Cargando histórico...</div>
            )}
        </div>
    );
}
