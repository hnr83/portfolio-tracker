import React, { useMemo, useState } from "react";
import AssetAvatar from "../shared/AssetAvatar";

function getAssetType(row) {
    if (row.is_cedear) return "CEDEAR";

    const ticker = row.normalized_ticker || row.ticker || "";

    if (
        ticker.startsWith("CURRENCY:") ||
        ["BTC", "ETH", "SOL", "RON", "USDT"].includes(ticker)
    ) {
        return "CRYPTO";
    }

    return "STOCK";
}

function getAssetTypeClass(assetType) {
    if (assetType === "CEDEAR") {
        return "bg-indigo-500/15 text-indigo-300";
    }

    if (assetType === "CRYPTO") {
        return "bg-orange-500/15 text-orange-300";
    }

    return "bg-slate-800 text-slate-300";
}

function getMobileTicker(row) {
    if (row.is_cedear && row.underlying_ticker) {
        return row.underlying_ticker;
    }

    const ticker = row.normalized_ticker || row.ticker || "-";

    return ticker.replace("CURRENCY:", "");
}

function MarketMoverCard({
    title,
    row,
    positive = true,
    formatPercent,
    formatCurrency,
}) {
    const accentClass = positive
        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
        : "border-red-500/20 bg-red-500/[0.04]";

    const valueClass = positive ? "text-emerald-400" : "text-red-400";

    return (
        <div className={`rounded-2xl border p-3 shadow-sm md:p-4 ${accentClass}`}>
            <div className="flex items-start justify-between gap-2 md:gap-4">
                <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 md:text-xs md:tracking-[0.24em]">
                        {title}
                    </div>

                    <div className={`mt-2 text-xl font-bold md:text-3xl ${valueClass}`}>
                        {row ? formatPercent(row.change_pct_1d) : "-"}
                    </div>

                    <div className="mt-2 truncate text-sm font-semibold text-white md:mt-3 md:text-lg">
                        {row ? row.ticker : "-"}
                    </div>

                    <div className="mt-1 truncate text-xs text-slate-400 md:text-sm">
                        {row && row.market_price != null
                            ? formatCurrency(row.market_price, row.currency || "USD")
                            : "-"}
                    </div>

                    <div
                        className={`mt-2 text-xs font-medium md:mt-3 md:text-sm ${valueClass}`}
                    >
                        {row && row.change_1d != null
                            ? formatCurrency(row.change_1d, row.currency || "USD")
                            : "-"}
                    </div>
                </div>

                <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10 ${positive
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                >
                    <span className="font-sans text-base leading-none md:text-lg">
                        {positive ? "↑" : "↓"}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function MarketView({
    marketSearch,
    setMarketSearch,
    marketTypeFilter,
    setMarketTypeFilter,
    marketSort,
    setMarketSort,
    filteredAndSortedMarket,
    marketTopStats,
    formatCurrency,
    formatPercent,
    SortableHeader,
    FilterToolbar,
    SectionShell,
}) {
    const [mobileTab, setMobileTab] = useState("GAINERS");

    const mobileGainers = useMemo(() => {
        return filteredAndSortedMarket
            .filter((row) => Number(row.change_pct_1d || 0) > 0)
            .sort(
                (a, b) =>
                    Number(b.change_pct_1d || 0) -
                    Number(a.change_pct_1d || 0)
            )
            .slice(0, 15);
    }, [filteredAndSortedMarket]);

    const mobileLosers = useMemo(() => {
        return filteredAndSortedMarket
            .filter((row) => Number(row.change_pct_1d || 0) < 0)
            .sort(
                (a, b) =>
                    Number(a.change_pct_1d || 0) -
                    Number(b.change_pct_1d || 0)
            )
            .slice(0, 15);
    }, [filteredAndSortedMarket]);

    const mobileRows =
        mobileTab === "GAINERS" ? mobileGainers : mobileLosers;

    const mobilePositive = mobileTab === "GAINERS";

    return (
        <SectionShell className="mt-2">
            <div className="mb-4 flex flex-col gap-2 md:mb-5 md:flex-row md:items-end md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-white">
                        Mercado
                    </h2>

                    <p className="mt-1 text-sm text-slate-400">
                        Cotizaciones actuales y variación diaria
                    </p>
                </div>

                <div className="text-sm text-slate-400">
                    {filteredAndSortedMarket.length} resultados
                </div>
            </div>

            <div className="hidden md:block">
                <FilterToolbar>
                    <input
                        type="text"
                        placeholder="Buscar ticker, underlying o ratio..."
                        value={marketSearch}
                        onChange={(e) => setMarketSearch(e.target.value)}
                        className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />

                    <select
                        value={marketTypeFilter}
                        onChange={(e) =>
                            setMarketTypeFilter(e.target.value)
                        }
                        className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="ALL">Todos</option>
                        <option value="STOCK">Stocks</option>
                        <option value="CRYPTO">Crypto</option>
                        <option value="CEDEAR">CEDEARs</option>
                    </select>
                </FilterToolbar>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:mb-6 md:gap-4">
                <MarketMoverCard
                    title="Mayor suba 1D"
                    row={marketTopStats.topGainer}
                    positive={true}
                    formatPercent={formatPercent}
                    formatCurrency={formatCurrency}
                />

                <MarketMoverCard
                    title="Mayor baja 1D"
                    row={marketTopStats.topLoser}
                    positive={false}
                    formatPercent={formatPercent}
                    formatCurrency={formatCurrency}
                />
            </div>

            <div className="md:hidden">
                <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-1 backdrop-blur">
                    <div className="grid grid-cols-2 gap-1">
                        <button
                            type="button"
                            onClick={() => setMobileTab("GAINERS")}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${mobileTab === "GAINERS"
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                                }`}
                        >
                            Ganadoras
                        </button>

                        <button
                            type="button"
                            onClick={() => setMobileTab("LOSERS")}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${mobileTab === "LOSERS"
                                    ? "bg-red-500/15 text-red-300"
                                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                                }`}
                        >
                            Perdedoras
                        </button>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900">
                    <table className="w-full table-fixed text-sm">
                        <thead className="bg-slate-950/95 text-slate-500">
                            <tr>
                                <th className="px-2.5 py-2 text-left text-[10px] uppercase tracking-[0.16em]">
                                    Ticker
                                </th>

                                <th className="w-[88px] px-2.5 py-2 text-right text-[10px] uppercase tracking-[0.16em]">
                                    Precio
                                </th>

                                <th className="w-[64px] px-2.5 py-2 text-right text-[10px] uppercase tracking-[0.16em]">
                                    1D %
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {mobileRows.map((row, i) => (
                                <tr
                                    key={`mobile-${row.ticker}-${i}`}
                                    className="border-t border-slate-800/80"
                                >
                                    <td className="px-2.5 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <AssetAvatar
                                                ticker={getMobileTicker(row)}
                                                normalizedTicker={row.normalized_ticker}
                                                size={26}
                                            />

                                            <div className="min-w-0 flex-1">
                                                {row.is_cedear && (
                                                    <div className="truncate text-[10px] text-indigo-300">
                                                        CEDEAR · {row.ratio_text || "-"}
                                                    </div>
                                                )}

                                                {!row.is_cedear && row.normalized_ticker && row.normalized_ticker !== row.ticker && (
                                                    <div className="truncate text-[10px] text-slate-500">
                                                        {row.normalized_ticker}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="w-[88px] px-2.5 py-2 text-right text-[13px] tabular-nums text-white">
                                        {row.market_price == null
                                            ? "-"
                                            : formatCurrency(
                                                row.market_price,
                                                row.currency || "USD"
                                            )}
                                    </td>

                                    <td
                                        className={`w-[64px] px-2.5 py-2 text-right text-[13px] font-semibold tabular-nums ${mobilePositive
                                                ? "text-emerald-400"
                                                : "text-red-400"
                                            }`}
                                    >
                                        {formatPercent(row.change_pct_1d)}
                                    </td>
                                </tr>
                            ))}

                            {mobileRows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={3}
                                        className="px-3 py-8 text-center text-sm text-slate-500"
                                    >
                                        Sin datos para mostrar
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="hidden overflow-auto rounded-3xl border border-slate-800/80 bg-slate-900 md:block">
                <table className="w-full text-sm">
                    <thead className="bg-slate-950/95 text-slate-400">
                        <tr>
                            <SortableHeader
                                label="Ticker"
                                sortKey="ticker"
                                sortState={marketSort}
                                onSort={setMarketSort}
                            />

                            <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                                Tipo
                            </th>

                            <SortableHeader
                                label="Precio"
                                sortKey="market_price"
                                sortState={marketSort}
                                onSort={setMarketSort}
                                align="right"
                            />

                            <SortableHeader
                                label="1D"
                                sortKey="change_1d"
                                sortState={marketSort}
                                onSort={setMarketSort}
                                align="right"
                            />

                            <SortableHeader
                                label="1D %"
                                sortKey="change_pct_1d"
                                sortState={marketSort}
                                onSort={setMarketSort}
                                align="right"
                            />

                            <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                                Actualizado
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredAndSortedMarket.map((row, i) => {
                            const assetType = getAssetType(row);

                            return (
                                <tr
                                    key={`${row.ticker}-${i}`}
                                    className="border-t border-slate-800/80 transition-colors hover:bg-slate-800/20"
                                >
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col">
                                            <AssetAvatar
                                                ticker={row.ticker}
                                                normalizedTicker={
                                                    row.normalized_ticker
                                                }
                                                size={28}
                                            />

                                            {row.is_cedear && (
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                                        {row.underlying_ticker ||
                                                            "-"}
                                                    </span>

                                                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                                                        {row.ratio_text || "-"}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-4 py-4 text-slate-300">
                                        <span
                                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getAssetTypeClass(
                                                assetType
                                            )}`}
                                        >
                                            {assetType}
                                        </span>
                                    </td>

                                    <td className="px-4 py-4 text-right tabular-nums text-white">
                                        {row.market_price == null
                                            ? "-"
                                            : formatCurrency(
                                                row.market_price,
                                                row.currency || "USD"
                                            )}
                                    </td>

                                    <td
                                        className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(row.change_1d || 0) >= 0
                                                ? "text-emerald-400"
                                                : "text-red-400"
                                            }`}
                                    >
                                        {formatCurrency(
                                            row.change_1d,
                                            row.currency || "USD"
                                        )}
                                    </td>

                                    <td
                                        className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(row.change_pct_1d || 0) >= 0
                                                ? "text-emerald-400"
                                                : "text-red-400"
                                            }`}
                                    >
                                        {formatPercent(row.change_pct_1d)}
                                    </td>

                                    <td className="px-4 py-4 text-slate-300">
                                        {row.as_of_ts &&
                                            !Number.isNaN(
                                                new Date(row.as_of_ts).getTime()
                                            )
                                            ? new Date(
                                                row.as_of_ts
                                            ).toLocaleString("es-AR")
                                            : "-"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </SectionShell>
    );
}