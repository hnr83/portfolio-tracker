import React, { useRef, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import AssetAvatar from "../shared/AssetAvatar";
import BingxSpotImportModal from "../modals/BingxSpotImportModal";

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
    investmentsUsd,
    liquidityUsd,
    dailyPnlUsd,
    dailyPnlPct,
    compositionMetric,
    setCompositionMetric,
    chartTotalValue,
}) {
    const touchStartY = useRef(0);
    const touchEndY = useRef(0);

    const [isBingxSpotModalOpen, setIsBingxSpotModalOpen] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [isPullRefreshing, setIsPullRefreshing] = useState(false);
    const [hideValues, setHideValues] = useState(() => {
        return localStorage.getItem("portfolio-hide-values") === "true";
    });

    const handleTouchStart = (e) => {
        if (window.scrollY <= 0) {
            touchStartY.current = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e) => {
        if (window.scrollY > 0) return;

        touchEndY.current = e.touches[0].clientY;
        const distance = touchEndY.current - touchStartY.current;

        if (distance > 0) {
            setPullDistance(Math.min(distance, 120));
        }
    };

    const handleTouchEnd = async () => {
        if (pullDistance > 80 && !isPullRefreshing) {
            try {
                setIsPullRefreshing(true);
                await refreshMarketData();
            } finally {
                setTimeout(() => {
                    setIsPullRefreshing(false);
                }, 600);
            }
        }

        setPullDistance(0);
    };

    const toggleHideValues = () => {
        const next = !hideValues;

        setHideValues(next);

        localStorage.setItem("portfolio-hide-values", String(next));
    };



    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative"
        >
            <div
                className={`pointer-events-none sticky top-0 z-40 flex justify-center transition-all duration-200 lg:hidden ${pullDistance > 0 || isPullRefreshing ? "opacity-100" : "opacity-0"
                    }`}
                style={{
                    transform: `translateY(${Math.min(pullDistance - 40, 30)}px)`,
                }}
            >
                <div className="rounded-full border border-slate-700 bg-slate-950/90 px-4 py-2 text-xs text-slate-300 shadow-lg backdrop-blur-xl">
                    {isPullRefreshing
                        ? "Actualizando..."
                        : pullDistance > 80
                            ? "Soltá para actualizar"
                            : "Deslizá para actualizar"}
                </div>
            </div>

            <div className="flex flex-col gap-3 border-slate-800/80 pb-4 sm:gap-4 sm:pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-indigo-400 sm:text-xs sm:tracking-[0.24em]">
                                Dashboard
                            </div>

                            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl xl:text-[34px] 2xl:text-5xl"></h1><h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:mt-3 sm:text-4xl lg:text-5xl">
                                Portfolio{" "}
                                <span className="text-indigo-400">Jubilación</span>
                            </h1>

                            <p className="mt-1.5 max-w-2xl text-xs text-slate-400 sm:text-sm 2xl:text-base">
                                Visión general de tu portfolio y su evolución
                            </p>
                        </div>

                        <button
                            onClick={toggleHideValues}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/80 text-lg text-slate-300 transition hover:border-slate-600 hover:bg-slate-900 lg:hidden"
                        >
                            {hideValues ? "🙈" : "👁"}
                        </button>
                    </div>
                </div>

                <div className="flex flex-row gap-2 lg:justify-end">
                    <button
                        onClick={refreshMarketData}
                        disabled={isRefreshing}
                        className="hidden flex-1 rounded-xl border border-slate-700/70 bg-transparent px-4 py-2 text-xs text-white transition-all duration-200 hover:bg-slate-800/60 disabled:opacity-50 sm:block sm:w-auto sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
                    >
                        {isRefreshing ? "Actualizando..." : "Actualizar datos"}
                    </button>

                    <button
                        onClick={() => setIsBingxSpotModalOpen(true)}
                        className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-200 transition-all duration-200 hover:bg-emerald-500/20 sm:w-auto sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
                    >
                        Importar BingX Spot
                    </button>                    

                    <button
                        onClick={() => setIsTransactionModalOpen(true)}
                        className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 text-xs font-medium text-white shadow-[0_10px_30px_rgba(93,124,250,0.32)] transition-all duration-200 hover:opacity-90 sm:w-auto sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
                    >
                        + Agregar transacción
                    </button>
                </div>
            </div>

            <div className="-mt-1 hidden sm:block">
                <KpiVisibilityRail
                    isOpen={showKpis}
                    isPinned={pinKpis}
                    onToggle={handleToggleKpis}
                    onPinToggle={handlePinKpisToggle}
                />
            </div>

            {!summary && (
                <SectionShell className="mt-6 sm:mt-10">
                    <div className="text-slate-300">Cargando resumen...</div>
                </SectionShell>
            )}

            <div
                className={`overflow-hidden transition-all duration-300 ease-out ${showKpis
                    ? "max-h-[900px] opacity-100"
                    : "max-h-[900px] opacity-100 sm:max-h-0 sm:opacity-0"
                    }`}
                aria-hidden={!showKpis}
            >
                {summary && (
                    <div className="grid auto-rows-fr grid-cols-2 gap-3 pb-1 xl:grid-cols-4 2xl:gap-4">
                        <SummaryCard
                            title="Total Portfolio USD"
                            value={
                                hideValues
                                    ? "US$ ••••••"
                                    : formatCurrency(summary.total_with_trading_usd, "USD")
                            }
                            subtitle={
                                hideValues
                                    ? "US$ ••••••"
                                    : formatCurrency(summary.total_with_trading_ars, "ARS")
                            }
                            icon="◫"
                        />

                        <SummaryCard
                            title="Resultado de hoy"
                            value={hideValues ? "US$ ••••••" : `${dailyPnlUsd >= 0 ? "+" : ""}${formatCurrency(dailyPnlUsd || 0, "USD")}`}
                            valueClassName={hideValues ? "text-white" : dailyPnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}
                            subtitle={hideValues || dailyPnlPct == null ? "••••••" : `${dailyPnlPct >= 0 ? "+" : ""}${formatPortfolioPercent(dailyPnlPct)}`}
                            subtitleClassName={dailyPnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}
                            icon="↕"
                        />

                        <SummaryCard
                            title="Investments USD"
                            value={
                                hideValues
                                    ? "US$ ••••••"
                                    : formatCurrency(investmentsUsd, "USD")
                            }
                            subtitle={
                                hideValues
                                    ? "••••••"
                                    : `${summary?.unrealized_pnl_usd >= 0 ? "+" : ""}${formatCurrency(
                                        summary?.unrealized_pnl_usd || 0,
                                        "USD"
                                    )} · ${formatPortfolioPercent(
                                        (summary?.unrealized_pnl_pct || 0) * 100
                                    )}`
                            }
                            subtitleClassName={
                                summary?.unrealized_pnl_usd >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                            }
                            icon="↗"
                        />

                        <SummaryCard
                            title="Liquidez USD + USDT"
                            value={
                                hideValues
                                    ? "US$ ••••••"
                                    : formatCurrency(liquidityUsd, "USD")
                            }
                            icon="◉"
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
                <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 xl:grid-cols-5 2xl:gap-6">
                    <SectionShell className="xl:col-span-3 xl:min-h-[270px] 2xl:min-h-[330px]">
                        <div className="flex h-full min-h-[300px] flex-col 2xl:min-h-[380px]">
                            <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                    <div className="text-base font-semibold text-white sm:text-[20px]">
                                        Portfolio Composition
                                    </div>

                                    <div className="mt-1 text-xs text-slate-400 sm:text-sm">
                                        {compositionMetric === "platform"
                                            ? "Distribución del capital invertido por broker"
                                            : "Allocation by current market value"}
                                    </div>
                                </div>

                                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:gap-4 lg:justify-end">
                                    <select
                                        value={compositionMetric}
                                        onChange={(e) => setCompositionMetric(e.target.value)}
                                        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/90 px-3 py-2 text-xs text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm"
                                    >
                                        <option value="market_value_usd">Valor actual</option>
                                        <option value="cost_value_usd">Costo</option>
                                        <option value="platform">Plataforma</option>
                                    </select>

                                    <div className="text-left sm:text-right">
                                        <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500 sm:text-xs">
                                            Valor Actual
                                        </div>

                                        <div className="mt-1 whitespace-nowrap text-lg font-semibold leading-tight text-white tabular-nums sm:text-2xl">
                                            {hideValues
                                                ? "US$ ••••••"
                                                : formatCurrency(chartTotalValue, "USD")}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* MOBILE COMPACT */}
                            <div className="mt-4 flex items-center gap-4 lg:hidden">
                                <div className="flex shrink-0 items-center justify-center">
                                    <div className="h-[135px] w-[135px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={compositionData.slice(0, 4)}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius="62%"
                                                    outerRadius="78%"
                                                    paddingAngle={3}
                                                    stroke="#07101F"
                                                    strokeWidth={2}
                                                >
                                                    {compositionData
                                                        .slice(0, 4)
                                                        .map((entry, index) => (
                                                            <Cell
                                                                key={`cell-mobile-${index}`}
                                                                fill={
                                                                    CHART_COLORS[
                                                                    index % CHART_COLORS.length
                                                                    ]
                                                                }
                                                            />
                                                        ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1 space-y-2">
                                    {compositionData.slice(0, 4).map((item, index) => {
                                        const pct = chartTotalValue
                                            ? (item.value / chartTotalValue) * 100
                                            : 0;

                                        return (
                                            <button
                                                key={item.name}
                                                onClick={() => setSelectedTicker(item.name)}
                                                className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition ${selectedTicker === item.name
                                                    ? "bg-indigo-500/10"
                                                    : "hover:bg-slate-900/60"
                                                    }`}
                                            >
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span
                                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                        style={{
                                                            backgroundColor:
                                                                CHART_COLORS[
                                                                index % CHART_COLORS.length
                                                                ],
                                                        }}
                                                    />

                                                    <span className="truncate text-xs font-medium text-white">
                                                        {item.name}
                                                    </span>
                                                </div>

                                                <span className="shrink-0 text-[11px] text-slate-400">
                                                    {formatPortfolioPercent(pct)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* DESKTOP */}
                            <div className="hidden flex-1 items-center justify-center lg:flex">
                                <div className="h-[210px] w-full max-w-[300px] 2xl:h-[300px] 2xl:max-w-[400px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={compositionData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="52%"
                                                outerRadius="82%"
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
                                                        fill={
                                                            CHART_COLORS[
                                                            index % CHART_COLORS.length
                                                            ]
                                                        }
                                                        stroke={
                                                            index === activeIndex
                                                                ? "#ffffff"
                                                                : "#07101F"
                                                        }
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
                        </div>
                    </SectionShell>

                    <SectionShell className="hidden xl:flex xl:min-h-[300px] xl:col-span-2 2xl:min-h-[380px]">
                        <div className="flex h-full w-full flex-col">
                            <div>
                                <div className="mb-1 text-lg font-semibold text-white sm:text-[20px]">
                                    Top Holdings
                                </div>

                                <div className="text-sm text-slate-400">
                                    Ranked by market value
                                </div>
                            </div>

                            <div className="mt-3 max-h-[275px] flex-1 space-y-2 overflow-y-auto scrollbar-hide overscroll-contain 2xl:max-h-[300px] 2xl:space-y-3">                                {chartData.map((item, index) => {
                                const pct = chartTotalValue
                                    ? (item.value / chartTotalValue) * 100
                                    : 0;

                                return (
                                    <div
                                        key={item.name}
                                        onClick={() => setSelectedTicker(item.name)}
                                        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-all 2xl:px-4 2xl:py-3 ${selectedTicker === item.name
                                            ? "border-indigo-500 bg-indigo-500/10"
                                            : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                                            }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span
                                                className="h-3.5 w-3.5 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        CHART_COLORS[
                                                        index % CHART_COLORS.length
                                                        ],
                                                }}
                                            />

                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-white">
                                                    {item.name}
                                                </div>

                                                <div className="text-[12px] text-slate-500">
                                                    {compositionMetric === "platform"
                                                        ? `${formatPortfolioPercent(
                                                            pct
                                                        )} del capital invertido`
                                                        : `${formatPortfolioPercent(
                                                            pct
                                                        )} del portfolio`}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="shrink-0 text-right">
                                            <div className="whitespace-nowrap text-sm font-semibold text-white tabular-nums">
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
                <SectionShell className="mt-5 sm:mt-6 xl:mt-8 2xl:mt-12">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-white sm:text-2xl">
                                Investments
                            </h2>
                            <p className="mt-1 hidden text-sm text-slate-400 sm:block">
                                Posiciones actuales del portfolio
                            </p>
                        </div>

                        <div className="hidden text-sm text-slate-400 sm:block">
                            {filteredInvestments.length} resultados
                        </div>
                    </div>

                    <div className="hidden sm:block">
                        <FilterToolbar
                            right={
                                selectedTicker ? (
                                    <button
                                        onClick={() => setSelectedTicker(null)}
                                        className="h-[54px] w-full rounded-2xl border border-slate-700/70 bg-slate-950/90 px-4 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-auto"                                    >
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
                                className="h-[54px] w-full rounded-2xl border border-slate-700/70 bg-slate-950/90 px-4 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-auto"                            />

                            <select
                                value={investmentCategoryFilter}
                                onChange={(e) =>
                                    setInvestmentCategoryFilter(e.target.value)
                                }
                                className="h-[54px] w-full rounded-2xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-auto"
                            >
                                <option value="ALL">Todas las categorías</option>
                                <option value="PORTFOLIO">PORTFOLIO</option>
                                <option value="CRYPTO">CRYPTO</option>
                                <option value="FX">FX</option>
                                <option value="CASH">CASH</option>
                            </select>
                        </FilterToolbar>
                    </div>

                    <>
                        {/* MOBILE */}
                        <div className="space-y-2 lg:hidden">
                            {filteredInvestments.map((inv, i) => {
                                const displayTicker = inv.normalized_ticker || inv.ticker;
                                const qty = Number(inv.quantity_net || 0);

                                return (
                                    <button
                                        key={`${inv.ticker}-${i}`}
                                        onClick={() => openAssetTransactions(inv)}
                                        className={`w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-left transition ${selectedTicker && displayTicker === selectedTicker
                                            ? "border-indigo-500/40 bg-indigo-500/10"
                                            : "hover:border-slate-700"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <AssetAvatar
                                                    ticker={inv.ticker}
                                                    normalizedTicker={inv.normalized_ticker}
                                                    size={34}
                                                />

                                                <div className="mt-1 truncate text-xs text-slate-500">
                                                    {formatNumber(qty, 4)} {displayTicker}
                                                </div>
                                            </div>

                                            <div className="shrink-0 text-right">
                                                <div className="text-base font-semibold text-white tabular-nums">
                                                    {hideValues
                                                        ? "US$ ••••••"
                                                        : formatCurrency(
                                                            inv.market_value_usd,
                                                            "USD"
                                                        )}
                                                </div>

                                                <div
                                                    className={`mt-1 text-xs font-semibold tabular-nums ${inv.pnl_pct >= 0
                                                        ? "text-emerald-400"
                                                        : "text-red-400"
                                                        }`}
                                                >
                                                    {formatPercent(inv.pnl_pct)}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* DESKTOP */}
                        <div className="hidden overflow-x-auto rounded-[18px] border border-slate-800/80 bg-slate-950/70 sm:rounded-[22px] lg:block">
                            <table className="min-w-[980px] text-xs 2xl:text-sm">
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
                                                onClick={() => openAssetTransactions(inv)}
                                                className={`cursor-pointer border-t border-slate-800/80 transition-colors hover:bg-slate-800/30 ${selectedTicker &&
                                                    (inv.normalized_ticker || inv.ticker) ===
                                                    selectedTicker
                                                    ? "bg-indigo-500/8"
                                                    : ""
                                                    }`}
                                            >
                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4">
                                                    <AssetAvatar
                                                        ticker={inv.ticker}
                                                        normalizedTicker={inv.normalized_ticker}
                                                        size={28}
                                                    />
                                                </td>

                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4 text-slate-300">
                                                    {inv.normalized_ticker}
                                                </td>

                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4 text-right text-white">
                                                    {formatNumber(inv.quantity_net, 4)}
                                                </td>

                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4 text-right text-slate-300">
                                                    {formatCurrency(
                                                        inv.market_price,
                                                        inv.price_currency || "USD"
                                                    )}
                                                </td>

                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4 text-right text-white tabular-nums">
                                                    {formatCurrency(inv.market_value_usd, "USD")}
                                                </td>

                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4 text-right text-slate-300 tabular-nums">
                                                    {formatPortfolioPercent(portfolioPct)}
                                                </td>

                                                <td className="px-3 py-3 2xl:px-4 2xl:py-4 text-right text-white tabular-nums">
                                                    {formatCurrency(inv.cost_value_usd, "USD")}
                                                </td>

                                                <td
                                                    className={`px-3 py-3 2xl:px-4 2xl:py-4 text-right font-semibold tabular-nums ${inv.pnl_usd >= 0
                                                        ? "text-emerald-400"
                                                        : "text-red-400"
                                                        }`}
                                                >
                                                    {formatCurrency(inv.pnl_usd, "USD")}
                                                </td>

                                                <td
                                                    className={`px-3 py-3 2xl:px-4 2xl:py-4 text-right font-semibold tabular-nums ${inv.pnl_pct >= 0
                                                        ? "text-emerald-400"
                                                        : "text-red-400"
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
                    </>
                </SectionShell>
            )}
            <BingxSpotImportModal
                isOpen={isBingxSpotModalOpen}
                onClose={() => setIsBingxSpotModalOpen(false)}
                onImported={refreshMarketData}
            />            
        </div>
    );
}
