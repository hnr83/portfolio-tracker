import React, { useMemo, useState } from "react";
import AssetAvatar from "../shared/AssetAvatar";

export default function HoldingsView({
    holdings = [],
    formatNumber,
    formatCurrency,
    SectionShell,
    onSelectHolding,
}) {
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("ALL");
    const [sortBy, setSortBy] = useState("market_value_usd");
    const [sortDir, setSortDir] = useState("desc");

    const categories = useMemo(() => {
        const unique = Array.from(
            new Set((holdings || []).map((h) => h.category).filter(Boolean))
        );
        return unique.sort((a, b) => String(a).localeCompare(String(b)));
    }, [holdings]);

    const filteredAndSorted = useMemo(() => {
        const term = search.trim().toLowerCase();

        const filtered = (holdings || []).filter((h) => {
            const ticker = String(h.ticker || "").toLowerCase();
            const normalizedTicker = String(h.normalized_ticker || "").toLowerCase();
            const category = String(h.category || "").toLowerCase();

            const matchesSearch =
                !term ||
                ticker.includes(term) ||
                normalizedTicker.includes(term) ||
                category.includes(term);

            const matchesCategory =
                categoryFilter === "ALL" || h.category === categoryFilter;

            return matchesSearch && matchesCategory;
        });

        const sorted = [...filtered].sort((a, b) => {
            let aValue;
            let bValue;

            if (sortBy === "ticker") {
                aValue = String(a.normalized_ticker || a.ticker || "").toLowerCase();
                bValue = String(b.normalized_ticker || b.ticker || "").toLowerCase();
            } else {
                aValue = a?.[sortBy];
                bValue = b?.[sortBy];
            }

            const isNumericSort = [
                "quantity_net",
                "market_value_usd",
                "pnl_usd",
                "reference_value",
                "change_pct_1d",
            ].includes(sortBy);

            if (isNumericSort) {
                aValue = Number(aValue ?? 0);
                bValue = Number(bValue ?? 0);
                return sortDir === "asc" ? aValue - bValue : bValue - aValue;
            }

            aValue = String(aValue ?? "").toLowerCase();
            bValue = String(bValue ?? "").toLowerCase();

            const comparison = aValue.localeCompare(bValue, undefined, {
                numeric: true,
                sensitivity: "base",
            });

            return sortDir === "asc" ? comparison : -comparison;
        });

        return sorted;
    }, [holdings, search, categoryFilter, sortBy, sortDir]);

    function handleSort(column) {
        if (sortBy === column) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
            return;
        }

        setSortBy(column);
        setSortDir(column === "ticker" || column === "category" ? "asc" : "desc");
    }

    function handleRowClick(holding) {
        if (typeof onSelectHolding === "function") {
            onSelectHolding(holding);
        }
    }

    function SortableHeader({ label, column, align = "left" }) {
        const active = sortBy === column;
        const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "↕";

        return (
            <th
                onClick={() => handleSort(column)}
                className={`px-4 py-3 text-xs uppercase tracking-[0.16em] text-slate-500 cursor-pointer select-none transition-colors hover:text-slate-300 ${align === "right" ? "text-right" : "text-left"
                    }`}
            >
                <div
                    className={`inline-flex items-center gap-2 ${align === "right" ? "justify-end w-full" : ""
                        }`}
                >
                    <span>{label}</span>
                    <span
                        className={`text-[11px] ${active ? "text-slate-300" : "text-slate-600"
                            }`}
                    >
                        {arrow}
                    </span>
                </div>
            </th>
        );
    }

    function formatPercent(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return "-";
        }

        const n = Number(value);
        return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
    }

    function renderReference(h) {
        if (h.category === "PORTFOLIO" && h.reference_value != null) {
            return formatCurrency?.(h.reference_value, "USD") ?? h.reference_value;
        }

        if (h.category === "LIQUIDITY" && h.reference_value != null) {
            return formatNumber?.(h.reference_value, 2) ?? h.reference_value;
        }

        return "-";
    }

    function renderReferenceSubtext(h) {
        if (h.category === "PORTFOLIO") return "PPC USD";
        if (h.category === "LIQUIDITY") return "TC implícito";
        return null;
    }

    return (
        <SectionShell className="mt-8">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Holdings</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Posiciones agregadas por activo
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-[220px]">
                        <label className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            Buscar
                        </label>
                        <input
                            type="text"
                            placeholder="Ticker o categoría..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-slate-600 focus:bg-slate-900"
                        />
                    </div>

                    <div className="min-w-[180px]">
                        <label className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            Categoría
                        </label>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-slate-600 focus:bg-slate-900"
                        >
                            <option value="ALL">Todas</option>
                            {categories.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="mb-4 flex items-center justify-between text-sm">
                <div className="text-slate-400">
                    {filteredAndSorted.length} resultado
                    {filteredAndSorted.length === 1 ? "" : "s"}
                </div>

                {(search || categoryFilter !== "ALL") && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearch("");
                            setCategoryFilter("ALL");
                        }}
                        className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-slate-300 transition hover:border-slate-700 hover:bg-slate-800/70"
                    >
                        Limpiar filtros
                    </button>
                )}
            </div>

            <div className="overflow-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                <table className="w-full text-sm">
                    <thead className="bg-slate-950/95 text-slate-400">
                        <tr>
                            <SortableHeader label="Ticker" column="ticker" />
                            <SortableHeader label="Categoría" column="category" />
                            <SortableHeader
                                label="Cantidad"
                                column="quantity_net"
                                align="right"
                            />
                            <SortableHeader
                                label="Costo / TC"
                                column="reference_value"
                                align="right"
                            />
                            <SortableHeader
                                label="Valor USD"
                                column="market_value_usd"
                                align="right"
                            />
                            <SortableHeader
                                label="1D %"
                                column="change_pct_1d"
                                align="right"
                            />
                            <SortableHeader label="PnL" column="pnl_usd" align="right" />
                        </tr>
                    </thead>

                    <tbody>
                        {filteredAndSorted.length > 0 ? (
                            filteredAndSorted.map((h, i) => {
                                const primaryTicker = h.normalized_ticker || h.ticker || "-";
                                const secondaryTicker =
                                    h.ticker &&
                                        h.normalized_ticker &&
                                        h.ticker !== h.normalized_ticker
                                        ? h.ticker
                                        : null;

                                return (
                                    <tr
                                        key={`${h.ticker || "row"}-${h.category || "cat"}-${i}`}
                                        onClick={() => handleRowClick(h)}
                                        className={`border-t border-slate-800/80 transition-colors hover:bg-slate-800/20 ${onSelectHolding ? "cursor-pointer" : ""
                                            }`}
                                    >
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <AssetAvatar
                                                    ticker={h.ticker}
                                                    normalizedTicker={h.normalized_ticker}
                                                    size={28}
                                                    showText={false}
                                                />

                                                <div className="min-w-0">
                                                    <div className="font-medium text-white">
                                                        {primaryTicker}
                                                    </div>

                                                    {secondaryTicker ? (
                                                        <div className="text-xs text-slate-500">
                                                            {secondaryTicker}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-4 py-4">
                                            <span className="inline-flex rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
                                                {h.category || "-"}
                                            </span>
                                        </td>

                                        <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                            {formatNumber?.(h.quantity_net, 4) ??
                                                h.quantity_net ??
                                                "-"}
                                        </td>

                                        <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                            <div>{renderReference(h)}</div>
                                            {renderReferenceSubtext(h) ? (
                                                <div className="text-xs text-slate-500">
                                                    {renderReferenceSubtext(h)}
                                                </div>
                                            ) : null}
                                        </td>

                                        <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                            {formatCurrency?.(h.market_value_usd, "USD") ??
                                                h.market_value_usd ??
                                                "-"}
                                        </td>

                                        <td
                                            className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(h.change_pct_1d) >= 0
                                                    ? "text-emerald-400"
                                                    : "text-red-400"
                                                }`}
                                        >
                                            {formatPercent(h.change_pct_1d)}
                                        </td>

                                        <td
                                            className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(h.pnl_usd) >= 0
                                                    ? "text-emerald-400"
                                                    : "text-red-400"
                                                }`}
                                        >
                                            {formatCurrency?.(h.pnl_usd, "USD") ?? h.pnl_usd ?? "-"}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center">
                                    <div className="text-sm text-slate-400">
                                        No hay holdings para mostrar con los filtros actuales.
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </SectionShell>
    );
}