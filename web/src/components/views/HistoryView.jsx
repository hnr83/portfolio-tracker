import { useEffect, useMemo, useState } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

const RANGE_OPTIONS = ["1M", "3M", "6M", "YTD", "1A", "MAX"];
const METRIC_OPTIONS = ["VALUE", "PNL"];

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

            <div className="mt-3 text-sm text-slate-300">
                {metric === "VALUE" ? "Valor total" : "PnL total"}
            </div>

            <div className="text-lg font-semibold text-white">
                {metric === "VALUE"
                    ? formatCurrency(row.market_value_usd, "USD")
                    : formatCurrency(row.total_pnl_usd, "USD")}
            </div>

            {metric === "PNL" && (
                <div className="text-sm text-slate-400 mt-1">
                    {formatPercentFromDecimal(row.total_pnl_pct)}
                </div>
            )}
        </div>
    );
}

export default function HistoryView() {
    const [range, setRange] = useState("6M");
    const [metric, setMetric] = useState("VALUE");
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

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

    const chartData = useMemo(() => {
        return history.map((row) => ({
            snapshot_date: row.snapshot_date?.value,
            market_value_usd: Number(row.market_value_usd),
            total_pnl_usd: Number(row.total_pnl_usd),
            total_pnl_pct: Number(row.total_pnl_pct),
        }));
    }, [history]);

    const firstRow = chartData[0] || null;
    const lastRow = chartData[chartData.length - 1] || null;

    const periodChangeUsd =
        firstRow && lastRow
            ? lastRow.market_value_usd - firstRow.market_value_usd
            : 0;

    const periodChangePct =
        firstRow && lastRow && firstRow.market_value_usd !== 0
            ? periodChangeUsd / firstRow.market_value_usd
            : 0;

    const pnlPositive = Number(lastRow?.total_pnl_usd || 0) >= 0;
    const periodPositive = periodChangeUsd >= 0;

    const dataKey = metric === "VALUE" ? "market_value_usd" : "total_pnl_usd";
    const strokeColor = metric === "VALUE" ? "#7c83ff" : "#18C29C";

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
                        Seguimiento del valor total y rendimiento.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        {RANGE_OPTIONS.map((opt) => (
                            <button
                                key={opt}
                                onClick={() => setRange(opt)}
                                className={`px-4 py-2 rounded-xl text-sm ${opt === range
                                        ? "bg-indigo-500/20 text-white"
                                        : "bg-white/5 text-slate-300"
                                    }`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        {METRIC_OPTIONS.map((opt) => (
                            <button
                                key={opt}
                                onClick={() => setMetric(opt)}
                                className={`px-4 py-2 rounded-xl text-sm ${opt === metric
                                        ? "bg-emerald-500/20 text-white"
                                        : "bg-white/5 text-slate-300"
                                    }`}
                            >
                                {opt === "VALUE" ? "Valor" : "PnL"}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <HistoryKpiCard
                    label="Valor actual"
                    value={formatCurrency(lastRow?.market_value_usd, "USD")}
                />
                <HistoryKpiCard
                    label="Variación"
                    value={`${periodPositive ? "+" : ""}${formatCurrency(periodChangeUsd, "USD")}`}
                    subvalue={formatPercentFromDecimal(periodChangePct)}
                    positive={periodPositive}
                />
                <HistoryKpiCard
                    label="PnL actual"
                    value={formatCurrency(lastRow?.total_pnl_usd, "USD")}
                    subvalue={formatPercentFromDecimal(lastRow?.total_pnl_pct)}
                    positive={pnlPositive}
                />
            </div>

            <div className="rounded-[24px] border border-slate-800/80 p-6">
                <div className="mb-6">
                    <div className="text-xs uppercase text-slate-500">
                        {metric === "VALUE" ? "Valor total USD" : "PnL USD"}
                    </div>
                    <div className="text-xl text-white font-semibold">
                        Evolución
                    </div>
                </div>

                <div className="h-[420px]">
                    <ResponsiveContainer>
                        <LineChart data={chartData}>
                            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="snapshot_date" tickFormatter={formatShortDate} />
                            <YAxis
                                domain={["dataMin - 2000", "dataMax + 2000"]}
                                tickFormatter={(value) => Number(value).toLocaleString("es-AR")}
                                tick={{ fill: "#94a3b8", fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={90}
                            />
                            <Tooltip content={<CustomTooltip metric={metric} />} />

                            <Line
                                type="monotone"
                                dataKey={dataKey}
                                stroke={strokeColor}
                                strokeWidth={3}
                                dot={{ r: 4 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}