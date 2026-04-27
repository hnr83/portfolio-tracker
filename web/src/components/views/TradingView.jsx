import { useCallback, useEffect, useMemo, useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import TradingModal from "../modals/TradingModal";

const API_BASE = "/api/trading";

const EMPTY_FORM = {
    instrument: "",
    direction: "LONG",
    capital_usd: "",
    opened_at: "",
    closed_at: "",
    entry_price: "",
    exit_price: "",
    leverage: 1,
    pnl_qty: "",
    exchange: "Bingx",
    is_capital_held: true,
    destination: "HOLD_COIN",
    notes: "",
};

function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatUsd(value, options = {}) {
    const n = toNumber(value);
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: options.maximumFractionDigits ?? 2,
        minimumFractionDigits: options.minimumFractionDigits ?? 2,
    }).format(n);
}

function formatNumber(value, digits = 2) {
    const n = toNumber(value);
    return new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    }).format(n);
}

function formatPercent(value) {
    const n = toNumber(value);
    return `${formatNumber(n * 100, 2)}%`;
}

function formatDate(value) {
    if (!value) return "-";

    const raw = typeof value === "object" && value.value ? value.value : value;
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) return String(raw);

    return new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
    }).format(date);
}

function pnlClass(value) {
    const n = toNumber(value);
    if (n > 0) return "text-emerald-400";
    if (n < 0) return "text-red-400";
    return "text-slate-300";
}

function badgeClass(value) {
    const normalized = String(value || "").toUpperCase();

    if (normalized === "LONG") {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    }

    if (normalized === "SHORT") {
        return "border-red-500/30 bg-red-500/10 text-red-300";
    }

    if (normalized === "HOLD_COIN") {
        return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
    }

    if (normalized === "HOLD_USDT") {
        return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    }

    if (normalized === "TO_INVESTMENT") {
        return "border-violet-500/30 bg-violet-500/10 text-violet-300";
    }

    if (normalized === "WITHDRAWN") {
        return "border-slate-500/30 bg-slate-500/10 text-slate-300";
    }

    return "border-slate-700 bg-slate-900 text-slate-300";
}

function Badge({ children }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(
                children
            )}`}
        >
            {children || "-"}
        </span>
    );
}

function KpiCard({ title, value, subtitle, valueClassName = "text-slate-100" }) {
    return (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/30">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                {title}
            </div>
            <div className={`mt-3 text-2xl font-semibold ${valueClassName}`}>
                {value}
            </div>
            {subtitle ? (
                <div className="mt-2 text-sm text-slate-500">{subtitle}</div>
            ) : null}
        </div>
    );
}

function EmptyState({ text }) {
    return (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-500">
            {text}
        </div>
    );
}

export default function TradingView() {
    const [summary, setSummary] = useState(null);
    const [byAsset, setByAsset] = useState([]);
    const [trades, setTrades] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [assetFilter, setAssetFilter] = useState("ALL");
    const [directionFilter, setDirectionFilter] = useState("ALL");
    const [destinationFilter, setDestinationFilter] = useState("ALL");
    const [search, setSearch] = useState("");

    const [openModal, setOpenModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState("");
    const [form, setForm] = useState(EMPTY_FORM);

    const [syncPreview, setSyncPreview] = useState(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncError, setSyncError] = useState("");
    const [syncResult, setSyncResult] = useState(null);

    const loadTradingData = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const [summaryRes, byAssetRes, tradesRes] = await Promise.all([
                fetch(`${API_BASE}/summary`),
                fetch(`${API_BASE}/by-asset`),
                fetch(`${API_BASE}`),
            ]);

            if (!summaryRes.ok || !byAssetRes.ok || !tradesRes.ok) {
                throw new Error("No se pudo cargar la información de trading.");
            }

            const [summaryData, byAssetData, tradesData] = await Promise.all([
                summaryRes.json(),
                byAssetRes.json(),
                tradesRes.json(),
            ]);

            setSummary(summaryData || {});
            setByAsset(Array.isArray(byAssetData) ? byAssetData : []);
            setTrades(Array.isArray(tradesData) ? tradesData : []);
        } catch (err) {
            console.error(err);
            setError(err.message || "Error cargando trading.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTradingData();
    }, [loadTradingData]);

    const handleOpenModal = () => {
        setForm(EMPTY_FORM);
        setModalError("");
        setOpenModal(true);
    };

    const handleCloseModal = () => {
        if (saving) return;
        setOpenModal(false);
        setModalError("");
    };

    const handleChange = (field, value) => {
        setForm((prev) => {
            const next = { ...prev, [field]: value };

            if (field === "direction") {
                next.destination = value === "SHORT" ? "HOLD_USDT" : "HOLD_COIN";
            }

            return next;
        });
    };

    const handleSubmit = async (payload) => {
        try {
            setSaving(true);
            setModalError("");

            const res = await fetch(`${API_BASE}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Error creando operación");
            }

            const snapshotRes = await fetch("/api/jobs/snapshot-portfolio", {
                method: "POST",
            });

            if (!snapshotRes.ok) {
                console.warn(
                    "La operación se guardó, pero no se pudo actualizar el snapshot."
                );
            }

            await loadTradingData();

            setOpenModal(false);
            setForm(EMPTY_FORM);
        } catch (err) {
            console.error(err);
            setModalError(err.message || "Error creando la operación.");
        } finally {
            setSaving(false);
        }
    };

    const handleSyncPreview = async () => {
        try {
            setSyncLoading(true);
            setSyncError("");
            setSyncResult(null);

            const res = await fetch(
                `${API_BASE}/bingx/sync-preview?lookbackDays=60&limit=100`
            );

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    data?.detail || data?.error || "Error generando preview de BingX"
                );
            }

            setSyncPreview(data);
        } catch (err) {
            console.error(err);
            setSyncError(err.message || "Error generando preview de BingX.");
        } finally {
            setSyncLoading(false);
        }
    };


    const handleSyncConfirm = async () => {
        try {
            setSyncLoading(true);
            setSyncError("");

            const rowsToInsert = syncPreview?.rowsToInsert || [];

            const res = await fetch(`${API_BASE}/bingx/sync-confirm`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ rowsToInsert }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    data?.detail || data?.error || "Error confirmando sync de BingX"
                );
            }

            setSyncResult(data);
            setSyncPreview(null);

            await loadTradingData();
        } catch (err) {
            console.error(err);
            setSyncError(err.message || "Error confirmando sync de BingX.");
        } finally {
            setSyncLoading(false);
        }
    };


    const handleCancelSyncPreview = () => {
        if (syncLoading) return;
        setSyncPreview(null);
        setSyncError("");
    };

    const assets = useMemo(() => {
        return [
            "ALL",
            ...new Set(trades.map((row) => row.instrument).filter(Boolean)),
        ];
    }, [trades]);

    const directions = useMemo(() => {
        return [
            "ALL",
            ...new Set(trades.map((row) => row.direction).filter(Boolean)),
        ];
    }, [trades]);

    const destinations = useMemo(() => {
        return [
            "ALL",
            ...new Set(trades.map((row) => row.destination).filter(Boolean)),
        ];
    }, [trades]);

    const filteredTrades = useMemo(() => {
        const q = search.trim().toLowerCase();

        return trades.filter((row) => {
            const matchesAsset =
                assetFilter === "ALL" || row.instrument === assetFilter;

            const matchesDirection =
                directionFilter === "ALL" || row.direction === directionFilter;

            const matchesDestination =
                destinationFilter === "ALL" || row.destination === destinationFilter;

            const matchesSearch =
                !q ||
                String(row.trade_id || "").toLowerCase().includes(q) ||
                String(row.instrument || "").toLowerCase().includes(q) ||
                String(row.contract_type || "").toLowerCase().includes(q) ||
                String(row.exchange || "").toLowerCase().includes(q);

            return (
                matchesAsset &&
                matchesDirection &&
                matchesDestination &&
                matchesSearch
            );
        });
    }, [trades, assetFilter, directionFilter, destinationFilter, search]);

    const chartData = useMemo(() => {
        return byAsset.map((row) => ({
            instrument: row.instrument,
            pnl_usd: toNumber(row.pnl_usd),
            trades: toNumber(row.trades),
        }));
    }, [byAsset]);

    if (loading) {
        return <div className="p-6 text-sm text-slate-400">Cargando trading...</div>;
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                        Trading
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold text-slate-100">
                        Resultado de operaciones
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        Vista separada del portfolio jubilación. El resultado se valoriza por
                        settlement: USDT directo y M-moneda contra precio actual.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSyncPreview}
                        disabled={syncLoading}
                        className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-black hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {syncLoading ? "Sync..." : "Importar trades de BingX"}
                    </button>

                    <button
                        onClick={handleOpenModal}
                        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400"
                    >
                        + Nueva operación
                    </button>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-right">
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                            Trades
                        </div>
                        <div className="mt-1 text-xl font-semibold text-slate-100">
                            {summary?.total_trades ?? 0}
                        </div>
                    </div>
                </div>
            </div>

            {syncError ? (
                <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">
                    {syncError}
                </div>
            ) : null}

            {syncResult ? (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-300">
                    Insertados desde BingX: {syncResult.inserted ?? 0}
                </div>
            ) : null}

            {syncPreview ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/30">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                        <div>
                            <div className="text-xs uppercase tracking-[0.22em] text-violet-300">
                                Preview sync BingX
                            </div>

                            <h2 className="mt-2 text-lg font-semibold text-slate-100">
                                Operaciones detectadas
                            </h2>

                            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                                    <div className="text-slate-500">Construidas</div>
                                    <div className="mt-1 text-xl font-semibold text-slate-100">
                                        {syncPreview.totalBuilt ?? 0}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                                    <div className="text-slate-500">Nuevas</div>
                                    <div className="mt-1 text-xl font-semibold text-emerald-400">
                                        {syncPreview.newTrades ?? 0}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                                    <div className="text-slate-500">Existentes</div>
                                    <div className="mt-1 text-xl font-semibold text-slate-200">
                                        {syncPreview.alreadyExists ?? 0}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                                    <div className="text-slate-500">Descartadas</div>
                                    <div className="mt-1 text-xl font-semibold text-amber-300">
                                        {syncPreview.skippedTrades ?? 0}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                                    <div className="text-slate-500">Lookback</div>
                                    <div className="mt-1 text-xl font-semibold text-slate-100">
                                        {syncPreview.lookbackDays ?? 60}d
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                            <button
                                onClick={handleSyncConfirm}
                                disabled={syncLoading || !syncPreview.newTrades}
                                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Confirmar inserción
                            </button>

                            <button
                                onClick={handleCancelSyncPreview}
                                disabled={syncLoading}
                                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>

                    {syncPreview.rowsToInsert?.length ? (
                        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
                            <table className="min-w-full divide-y divide-slate-800 text-sm">
                                <thead className="bg-slate-950">
                                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                                        <th className="px-4 py-3">Asset</th>
                                        <th className="px-4 py-3">Tipo</th>
                                        <th className="px-4 py-3">Fechas</th>
                                        <th className="px-4 py-3 text-right">Capital</th>
                                        <th className="px-4 py-3 text-right">PnL</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-900">
                                    {syncPreview.rowsToInsert.map((row) => (
                                        <tr
                                            key={row.trade_id}
                                            className="bg-slate-950/40 text-slate-300"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-100">
                                                    {row.instrument}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    {row.exchange}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <Badge>{row.direction}</Badge>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div>{formatDate(row.opened_at)}</div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    cierre {formatDate(row.closed_at)}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-right">
                                                {formatUsd(row.capital_usd)}
                                            </td>

                                            <td className="px-4 py-3 text-right">
                                                <div className={`font-semibold ${pnlClass(row.pnl_usd_reported)}`}>
                                                    {formatUsd(row.pnl_usd_reported)}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    {formatPercent(row.pnl_pct)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">
                            No hay operaciones nuevas para insertar.
                        </div>
                    )}
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    title="PnL total"
                    value={formatUsd(summary?.total_pnl_usd)}
                    subtitle="Resultado valuado actual"
                    valueClassName={pnlClass(summary?.total_pnl_usd)}
                />

                <KpiCard
                    title="Resultado retenido"
                    value={formatUsd(summary?.retained_result_usd)}
                    subtitle="Según is_capital_held"
                    valueClassName={pnlClass(summary?.retained_result_usd)}
                />

                <KpiCard
                    title="Hold coin"
                    value={formatUsd(summary?.pnl_hold_coin_usd)}
                    subtitle="Resultado en BTC / ETH / ADA valuado"
                    valueClassName={pnlClass(summary?.pnl_hold_coin_usd)}
                />

                <KpiCard
                    title="Hold USDT"
                    value={formatUsd(summary?.pnl_hold_usdt_usd)}
                    subtitle="Resultado liquidado en USDT"
                    valueClassName={pnlClass(summary?.pnl_hold_usdt_usd)}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/30">
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-100">
                                PnL por instrumento
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Agrupado desde vw_trading_by_asset.
                            </p>
                        </div>
                    </div>

                    {chartData.length ? (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <XAxis
                                        dataKey="instrument"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                                        tickFormatter={(value) => `${formatNumber(value, 0)}`}
                                    />
                                    <Tooltip
                                        cursor={{ opacity: 0.1 }}
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;

                                            const row = payload[0]?.payload;

                                            return (
                                                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm shadow-xl">
                                                    <div className="font-semibold text-slate-100">
                                                        {label}
                                                    </div>
                                                    <div className="mt-1 text-slate-400">
                                                        PnL:{" "}
                                                        <span className={pnlClass(row?.pnl_usd)}>
                                                            {formatUsd(row?.pnl_usd)}
                                                        </span>
                                                    </div>
                                                    <div className="text-slate-400">
                                                        Trades: {row?.trades}
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="pnl_usd" radius={[10, 10, 10, 10]}>
                                        {chartData.map((entry) => (
                                            <Cell
                                                key={entry.instrument}
                                                fill={entry.pnl_usd >= 0 ? "#34d399" : "#f87171"}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyState text="No hay datos por instrumento." />
                    )}
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/30">
                    <h2 className="text-lg font-semibold text-slate-100">Breakdown</h2>

                    <div className="mt-5 space-y-4">
                        {byAsset.map((row) => (
                            <div
                                key={row.instrument}
                                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-lg font-semibold text-slate-100">
                                        {row.instrument}
                                    </div>
                                    <div className="text-sm text-slate-500">
                                        {row.trades} trades
                                    </div>
                                </div>

                                <div className={`mt-3 text-xl font-semibold ${pnlClass(row.pnl_usd)}`}>
                                    {formatUsd(row.pnl_usd)}
                                </div>

                                <div className="mt-2 text-sm text-slate-500">
                                    Rendimiento sobre capital operado: {formatPercent(row.pnl_pct)}
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-slate-500">Hold coin</div>
                                        <div className={pnlClass(row.pnl_hold_coin_usd)}>
                                            {formatUsd(row.pnl_hold_coin_usd)}
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-slate-500">Hold USDT</div>
                                        <div className={pnlClass(row.pnl_hold_usdt_usd)}>
                                            {formatUsd(row.pnl_hold_usdt_usd)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {!byAsset.length ? <EmptyState text="Sin breakdown disponible." /> : null}
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/30">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">
                            Operaciones
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {filteredTrades.length} de {trades.length} trades
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar trade, asset, exchange..."
                            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-slate-600"
                        />

                        <select
                            value={assetFilter}
                            onChange={(e) => setAssetFilter(e.target.value)}
                            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                        >
                            {assets.map((item) => (
                                <option key={item} value={item}>
                                    {item === "ALL" ? "Todos los activos" : item}
                                </option>
                            ))}
                        </select>

                        <select
                            value={directionFilter}
                            onChange={(e) => setDirectionFilter(e.target.value)}
                            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                        >
                            {directions.map((item) => (
                                <option key={item} value={item}>
                                    {item === "ALL" ? "Long / Short" : item}
                                </option>
                            ))}
                        </select>

                        <select
                            value={destinationFilter}
                            onChange={(e) => setDestinationFilter(e.target.value)}
                            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                        >
                            {destinations.map((item) => (
                                <option key={item} value={item}>
                                    {item === "ALL" ? "Todos los destinos" : item}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
                    <div className="max-h-[520px] overflow-auto">
                        <table className="min-w-full divide-y divide-slate-800 text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-950">
                                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <th className="px-4 py-3">Trade</th>
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3">Tipo</th>
                                    <th className="px-4 py-3">Fechas</th>
                                    <th className="px-4 py-3 text-right">Capital</th>
                                    <th className="px-4 py-3 text-right">PnL qty</th>
                                    <th className="px-4 py-3 text-right">PnL USD</th>
                                    <th className="px-4 py-3">Destino</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-900">
                                {filteredTrades.map((row) => (
                                    <tr
                                        key={row.trade_id}
                                        className="bg-slate-950/40 text-slate-300 hover:bg-slate-900/70"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-200">
                                                {row.trade_id}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {row.exchange || "-"}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-slate-100">
                                                {row.instrument}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {row.contract_type}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3">
                                            <Badge>{row.direction}</Badge>
                                        </td>

                                        <td className="px-4 py-3">
                                            <div>{formatDate(row.opened_at)}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                cierre {formatDate(row.closed_at)} · {row.holding_days} días
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            {formatUsd(row.capital_usd)}
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            <div className={pnlClass(row.pnl_qty)}>
                                                {formatNumber(row.pnl_qty, 6)}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {row.settlement_asset}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            <div className={`font-semibold ${pnlClass(row.pnl_usd_calculated)}`}>
                                                {formatUsd(row.pnl_usd_calculated)}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {row.valuation_method}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3">
                                            <Badge>{row.destination}</Badge>
                                        </td>
                                    </tr>
                                ))}

                                {!filteredTrades.length ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                                            No hay operaciones para los filtros seleccionados.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <TradingModal
                open={openModal}
                form={form}
                saving={saving}
                error={modalError}
                onClose={handleCloseModal}
                onChange={handleChange}
                onSubmit={handleSubmit}
            />
        </div>
    );
}