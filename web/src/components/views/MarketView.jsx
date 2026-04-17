import React from "react";

function MarketMoverCard({ title, row, positive = true, formatPercent, formatCurrency }) {
    const accentClass = positive
        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
        : "border-red-500/20 bg-red-500/[0.04]";

    const valueClass = positive ? "text-emerald-400" : "text-red-400";

    return (
        <div className={`rounded-2xl border p-4 shadow-sm ${accentClass}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        {title}
                    </div>

                    <div className={`mt-2 text-3xl font-bold ${valueClass}`}>
                        {row ? formatPercent(row.change_pct_1d) : "-"}
                    </div>

                    <div className="mt-3 text-lg font-semibold text-white">
                        {row ? row.ticker : "-"}
                    </div>

                    <div className="mt-1 text-sm text-slate-400">
                        {row && row.market_price != null
                            ? formatCurrency(row.market_price, row.currency || "USD")
                            : "-"}
                    </div>

                    <div className={`mt-3 text-sm font-medium ${valueClass}`}>
                        {row && row.change_1d != null
                            ? formatCurrency(row.change_1d, row.currency || "USD")
                            : "-"}
                    </div>
                </div>

                <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${positive
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                >
                    <span className="text-lg leading-none font-sans">
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
    return (
        <SectionShell className="mt-2">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Mercado</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Cotizaciones actuales y variación diaria
                    </p>
                </div>

                <div className="text-sm text-slate-400">
                    {filteredAndSortedMarket.length} resultados
                </div>
            </div>

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
                    onChange={(e) => setMarketTypeFilter(e.target.value)}
                    className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                    <option value="ALL">Todos</option>
                    <option value="NORMAL">Normales</option>
                    <option value="CEDEAR">CEDEARs</option>
                </select>
            </FilterToolbar>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="overflow-auto rounded-3xl border border-slate-800/80 bg-slate-900">
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
                        {filteredAndSortedMarket.map((row, i) => (
                            <tr
                                key={`${row.ticker}-${i}`}
                                className="border-t border-slate-800/80 transition-colors hover:bg-slate-800/20"
                            >
                                <td className="px-4 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-white">{row.ticker}</span>

                                        {row.is_cedear && (
                                            <div className="mt-1 flex items-center gap-2">
                                                <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                                    {row.underlying_ticker || "-"}
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
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.is_cedear
                                                ? "bg-indigo-500/15 text-indigo-300"
                                                : "bg-slate-800 text-slate-300"
                                            }`}
                                    >
                                        {row.is_cedear ? "CEDEAR" : "Normal"}
                                    </span>
                                </td>

                                <td className="px-4 py-4 text-right tabular-nums text-white">
                                    {row.market_price == null
                                        ? "-"
                                        : formatCurrency(row.market_price, row.currency || "USD")}
                                </td>

                                <td
                                    className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(row.change_1d || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                >
                                    {formatCurrency(row.change_1d, row.currency || "USD")}
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
                                    {row.as_of_ts && !Number.isNaN(new Date(row.as_of_ts).getTime())
                                        ? new Date(row.as_of_ts).toLocaleString("es-AR")
                                        : "-"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionShell>
    );
}