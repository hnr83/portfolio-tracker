import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import AssetAvatar from "../shared/AssetAvatar";

const CHART_COLORS = [
    "#5B7CFA",
    "#18C29C",
    "#F5B041",
    "#F45B69",
    "#8E6FF7",
    "#23B7E5",
    "#7ED957",
    "#FF8A4C",
];

export default function DashboardView({
    summary,
    showKpis,
    refreshError,
    isRefreshing,
    refreshMarketData,
    setIsTransactionModalOpen,
    handleToggleKpis,
    handlePinKpisToggle,
    pinKpis,
    loadHoldings,
    loadMovements,
    selectedAssetMovements,
    activeView,
    loadMarket,
    KpiVisibilityRail,
    SectionShell,
    SummaryCard,
    FilterToolbar,
    SortableHeader,
    formatCurrency,
    formatPercent,
    formatPortfolioPercent,
    formatNumber,
    chartData,
    compositionData,
    activeIndex,
    setActiveIndex,
    selectedTicker,
    setSelectedTicker,
    filteredAndSortedInvestments,
    filteredInvestments,
    investmentSearch,
    setInvestmentSearch,
    investmentCategoryFilter,
    setInvestmentCategoryFilter,
    investmentSort,
    setInvestmentSort,
    openAssetTransactions,
    summaryTotalMarketUsd,
    totalPortfolioUsd,
    investmentsUsd,
    liquidityUsd,
    cryptoUsd,
    compositionTopCount,
    compositionMetric,
    setCompositionMetric,
    chartTotalValue,
}) {
    const activeItem = activeIndex != null ? compositionData[activeIndex] : null;

    return (
        <>
            <div className="flex flex-col gap-6 border-slate-800/80 pb-8 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-indigo-400">
                        Dashboard
                    </div>
                    <h1 className="mt-3 text-5xl font-bold tracking-tight text-white">
                        Portfolio <span className="text-indigo-400">Jubilación</span>
                    </h1>
                    <p className="mt-3 max-w-2xl text-base text-slate-400">
                        Visión general de tu portfolio y su evolución
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={refreshMarketData}
                        disabled={isRefreshing}
                        className="rounded-2xl border border-slate-700/70 bg-transparent px-5 py-3 text-white transition-all duration-200 hover:bg-slate-800/60 disabled:opacity-50"
                    >
                        {isRefreshing ? "Actualizando..." : "Actualizar datos"}
                    </button>

                    <button
                        onClick={() => setIsTransactionModalOpen(true)}
                        className="rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-3 font-medium text-white shadow-[0_10px_30px_rgba(93,124,250,0.32)] transition-all duration-200 hover:opacity-90"
                    >
                        + Agregar transacción
                    </button>
                </div>
            </div>

            <KpiVisibilityRail
                isOpen={showKpis}
                isPinned={pinKpis}
                onToggle={handleToggleKpis}
                onPinToggle={handlePinKpisToggle}
            />

            {!summary && (
                <SectionShell className="mt-10">
                    <div className="text-slate-300">Cargando resumen...</div>
                </SectionShell>
            )}

            <div
                className={`overflow-hidden transition-all duration-300 ease-out ${showKpis ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                aria-hidden={!showKpis}
            >
                {summary && (
                    <div className="grid grid-cols-1 gap-4 pb-1 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard
                            title="Total Portfolio USD"
                            value={formatCurrency(totalPortfolioUsd, "USD")}
                            subtitle={formatCurrency(summary.total_market_ars, "ARS")}
                            icon="◫"
                        />
                        <SummaryCard
                            title="Investments USD"
                            value={formatCurrency(investmentsUsd, "USD")}
                            icon="↗"
                        />
                        <SummaryCard
                            title="Liquidez USD"
                            value={formatCurrency(liquidityUsd, "USD")}
                            icon="◉"
                        />
                        <SummaryCard
                            title="Crypto USD"
                            value={formatCurrency(cryptoUsd, "USD")}
                            icon="₿"
                        />
                    </div>
                )}
            </div>

            {refreshError && (
                <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    {refreshError}
                </div>
            )}

            {chartData.length > 0 && summary && (
                <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-5">
                    <SectionShell className="xl:col-span-3 h-[480px] lg:h-[560px] xl:h-[620px]">
                        <div className="flex h-full flex-col">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-[20px] font-semibold text-white">
                                        Portfolio Composition
                                    </div>
                                    <div className="mt-1 text-sm text-slate-400">
                                        {compositionMetric === "platform"
                                            ? "Distribución del capital invertido por broker"
                                            : "Allocation by current market value"}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <select
                                        value={compositionMetric}
                                        onChange={(e) => setCompositionMetric(e.target.value)}
                                        className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    >
                                        <option value="market_value_usd">Valor actual</option>
                                        <option value="cost_value_usd">Costo</option>
                                        <option value="platform">Plataforma</option>
                                    </select>
                                </div>                                

                                <div className="text-right">
                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                        Valor Actual
                                    </div>
                                    <div className="mt-1 text-[clamp(1.4rem,1.8vw,2.1rem)] font-semibold leading-tight text-white tabular-nums">
                                        {formatCurrency(chartTotalValue, "USD")}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                                <div className="flex h-full w-full items-center justify-center">
                                    <div className="w-full max-w-[430px]">
                                        <ResponsiveContainer width="100%" height={320}>
                                            <PieChart>
                                                <Pie
                                                    data={compositionData}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={78}
                                                    outerRadius={122}
                                                    paddingAngle={3}
                                                    stroke="#07101F"
                                                    strokeWidth={2}
                                                    onMouseEnter={(_, index) => setActiveIndex(index)}
                                                    onMouseLeave={() => setActiveIndex(null)}
                                                    onClick={(data) => {
                                                        if (data?.name !== "Otros") {
                                                            setSelectedTicker(data.name);
                                                        }
                                                    }}
                                                >
                                                    {compositionData.map((entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                                                            stroke={index === activeIndex ? "#ffffff" : "#07101F"}
                                                            strokeWidth={index === activeIndex ? 3 : 2}
                                                        />
                                                    ))}
                                                </Pie>

                                                <Tooltip
                                                    formatter={(value, name) => [
                                                        formatCurrency(value, "USD"),
                                                        name,
                                                    ]}
                                                    contentStyle={{
                                                        backgroundColor: "#0b1220",
                                                        border: "1px solid #1e293b",
                                                        borderRadius: "14px",
                                                        color: "#fff",
                                                        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                                                    }}
                                                    labelStyle={{ color: "#cbd5e1" }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                                    {compositionData.map((item, index) => {
                                        const pct = chartTotalValue
                                            ? (item.value / chartTotalValue) * 100
                                            : 0;
                                        const isOthers = item.name === "Otros";

                                        return (
                                            <button
                                                key={item.name}
                                                onClick={() => {
                                                    if (!isOthers) {
                                                        setSelectedTicker(item.name);
                                                    }
                                                }}
                                                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${!isOthers && selectedTicker === item.name
                                                        ? "border-indigo-500/40 bg-indigo-500/10"
                                                        : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700"
                                                    } ${isOthers ? "cursor-default" : "cursor-pointer"}`}
                                            >
                                                <span
                                                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            CHART_COLORS[index % CHART_COLORS.length],
                                                    }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-semibold text-white">
                                                        {item.name}
                                                    </div>
                                                    <div className="mt-0.5 text-xs text-slate-500">
                                                        {isOthers
                                                            ? `${formatPortfolioPercent(pct)} · ${Math.max(
                                                                chartData.length - compositionTopCount,
                                                                0
                                                            )} posiciones`
                                                            : compositionMetric === "platform"
                                                                ? `${formatPortfolioPercent(pct)} del capital invertido`
                                                                : `${formatPortfolioPercent(pct)} del portfolio`}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-2 pb-1 text-center text-sm text-slate-400">
                                {activeItem ? (
                                    <>
                                        <span className="font-medium text-white">
                                            {activeItem.name}
                                        </span>{" "}
                                        · {formatCurrency(activeItem.value, "USD")}
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium text-white">
                                            Top {Math.min(compositionTopCount, chartData.length)} + otros
                                        </span>{" "}
                                        · click en un holding para filtrar la tabla
                                    </>
                                )}
                            </div>
                        </div>
                    </SectionShell>

                    <SectionShell className="xl:col-span-2 h-[480px] lg:h-[560px] xl:h-[620px]">
                        <div className="flex h-full flex-col">
                            <div>
                                <div className="mb-1 text-[20px] font-semibold text-white">
                                    Top Holdings
                                </div>
                                <div className="text-sm text-slate-400">
                                    Ranked by market value
                                </div>
                            </div>

                            <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
                                {chartData.map((item, index) => {
                                    const pct = chartTotalValue
                                        ? (item.value / chartTotalValue) * 100
                                        : 0;

                                    return (
                                        <div
                                            key={item.name}
                                            onClick={() => setSelectedTicker(item.name)}
                                            className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-all ${selectedTicker === item.name
                                                    ? "border-indigo-500 bg-indigo-500/10"
                                                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                                                }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span
                                                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            CHART_COLORS[index % CHART_COLORS.length],
                                                    }}
                                                />
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-white">
                                                        {item.name}
                                                    </div>
                                                    <div className="text-[12px] text-slate-500">
                                                        {compositionMetric === "platform"
                                                            ? `${formatPortfolioPercent(pct)} del capital invertido`
                                                            : `${formatPortfolioPercent(pct)} del portfolio`}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pl-4 text-right">
                                                <div className="text-sm font-semibold text-white tabular-nums whitespace-nowrap">
                                                    {formatCurrency(item.value, "USD")}
                                                </div>
                                                {index === 0 && (
                                                    <div className="mt-1 inline-flex rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-300">
                                                        Largest
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </SectionShell>
                </div>
            )}

            {filteredAndSortedInvestments.length > 0 && (
                <SectionShell className="mt-16">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-2xl font-semibold text-white">
                                Investments
                            </h2>
                            <p className="mt-1 text-sm text-slate-400">
                                Posiciones actuales del portfolio
                            </p>
                        </div>

                        <div className="text-sm text-slate-400">
                            {filteredInvestments.length} resultados
                        </div>
                    </div>

                    <FilterToolbar
                        right={
                            selectedTicker ? (
                                <button
                                    onClick={() => setSelectedTicker(null)}
                                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-indigo-400 transition hover:bg-slate-900"
                                >
                                    Clear filter ({selectedTicker})
                                </button>
                            ) : null
                        }
                    >
                        <input
                            type="text"
                            placeholder="Buscar ticker..."
                            value={investmentSearch}
                            onChange={(e) => setInvestmentSearch(e.target.value)}
                            className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />

                        <select
                            value={investmentCategoryFilter}
                            onChange={(e) => setInvestmentCategoryFilter(e.target.value)}
                            className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="ALL">Todas las categorías</option>
                            <option value="PORTFOLIO">PORTFOLIO</option>
                            <option value="CRYPTO">CRYPTO</option>
                            <option value="FX">FX</option>
                            <option value="CASH">CASH</option>
                        </select>
                    </FilterToolbar>

                    <div className="overflow-x-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-950/95 text-slate-400">
                                <tr>
                                    <SortableHeader
                                        label="Ticker"
                                        sortKey="ticker"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                    />
                                    <SortableHeader
                                        label="Normalized"
                                        sortKey="normalized_ticker"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                    />
                                    <SortableHeader
                                        label="Qty"
                                        sortKey="quantity_net"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                        align="right"
                                    />
                                    <SortableHeader
                                        label="Price"
                                        sortKey="market_price"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                        align="right"
                                    />
                                    <SortableHeader
                                        label="Market Value USD"
                                        sortKey="market_value_usd"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                        align="right"
                                    />
                                    <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                                        % Portfolio
                                    </th>
                                    <SortableHeader
                                        label="Cost USD"
                                        sortKey="cost_value_usd"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                        align="right"
                                    />
                                    <SortableHeader
                                        label="PnL USD"
                                        sortKey="pnl_usd"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                        align="right"
                                    />
                                    <SortableHeader
                                        label="PnL %"
                                        sortKey="pnl_pct"
                                        sortState={investmentSort}
                                        onSort={setInvestmentSort}
                                        align="right"
                                    />
                                </tr>
                            </thead>

                            <tbody>
                                {filteredInvestments.map((inv, i) => {
                                    const portfolioPct = chartTotalValue
                                        ? (inv.market_value_usd / chartTotalValue) * 100
                                        : null;

                                    return (
                                        <tr
                                            key={`${inv.ticker}-${i}`}
                                            onClick={() => openAssetTransactions(inv.ticker)}
                                            className={`cursor-pointer border-t border-slate-800/80 transition-colors hover:bg-slate-800/30 ${selectedTicker &&
                                                    (inv.normalized_ticker || inv.ticker) === selectedTicker
                                                    ? "bg-indigo-500/8"
                                                    : ""
                                                }`}
                                        >
                                            <td className="px-4 py-4">
                                                <AssetAvatar
                                                    ticker={inv.ticker}
                                                    normalizedTicker={inv.normalized_ticker}
                                                    size={28}
                                                />
                                            </td>
                                            <td className="px-4 py-4 text-slate-300">
                                                {inv.normalized_ticker}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                {formatNumber(inv.quantity_net, 4)}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                {formatCurrency(inv.market_price, inv.price_currency || "USD")}
                                            </td>
                                            <td className="px-4 py-4 text-right tabular-nums">
                                                {formatCurrency(inv.market_value_usd, "USD")}
                                            </td>
                                            <td className="px-4 py-4 text-right text-slate-300 tabular-nums">
                                                {formatPortfolioPercent(portfolioPct)}
                                            </td>
                                            <td className="px-4 py-4 text-right tabular-nums">
                                                {formatCurrency(inv.cost_value_usd, "USD")}
                                            </td>
                                            <td
                                                className={`px-4 py-4 text-right font-semibold tabular-nums ${inv.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"
                                                    }`}
                                            >
                                                {formatCurrency(inv.pnl_usd, "USD")}
                                            </td>
                                            <td
                                                className={`px-4 py-4 text-right font-semibold tabular-nums ${inv.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"
                                                    }`}
                                            >
                                                {formatPercent(inv.pnl_pct)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </SectionShell>
            )}
        </>
    );
}