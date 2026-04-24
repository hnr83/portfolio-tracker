import React from "react";
import { formatCurrency, formatPercent } from "../../utils/formatters";

export default function Sidebar({
    summary,
    activeView,
    setActiveView,
    loadMovements,
    loadHoldings,
    loadMarket,
    setSelectedAssetMovements,
}) {
    const navClass = (view) =>
        `group cursor-pointer rounded-2xl px-4 py-3 transition-all duration-200 ${activeView === view
            ? "border border-indigo-500/20 bg-[linear-gradient(90deg,rgba(93,124,250,0.18)_0%,rgba(93,124,250,0.08)_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            : "text-slate-400 hover:bg-slate-900/70 hover:text-white"
        }`;

    const dotClass = (view) =>
        `h-2 w-2 rounded-full transition-all ${activeView === view ? "bg-indigo-400" : "bg-slate-700 group-hover:bg-slate-500"
        }`;

    const totalUsd = Number(summary?.total_market_usd || 0);
    const totalArs = Number(summary?.total_market_ars || 0);
    const investmentsUsd = Number(summary?.investments_market_usd || 0);

    const pnlUsd = Number(summary?.total_pnl_usd || 0);
    const pnlPct = Number(summary?.total_pnl_pct || 0);

    const pnlPositive = pnlUsd >= 0;

    return (
        <aside className="flex min-h-screen w-72 flex-col border-r border-slate-800/80 bg-[#020617] px-5 py-6">
            <div className="px-2 pt-2">
                <div className="flex items-start gap-3">
                    <div className="mt-1 h-16 w-[3px] rounded-full bg-gradient-to-b from-indigo-300 via-indigo-400 to-indigo-600" />
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.28em] text-white/90">
                            Portfolio
                        </div>
                        <div className="mt-1 text-[28px] font-bold leading-none tracking-tight text-white">
                            Jubilación
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-5">
                <div className="text-[12px] uppercase tracking-[0.28em] text-slate-400">
                    Valor de portfolio
                </div>

                <div className="mt-5 text-[28px] font-semibold leading-none text-white">
                    {formatCurrency(totalUsd, "USD")}
                </div>

                <div className="mt-3 text-[15px] text-slate-400">
                    {formatCurrency(totalArs, "ARS")}
                </div>

                <div className="mt-5 h-px bg-white/8" />

                {/* INVESTMENTS */}
                <div className="mt-4 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        Investments
                    </span>

                    <div className="text-right min-w-[110px]">
                        <div className="text-slate-200 font-small tabular-nums">
                            {formatCurrency(investmentsUsd, "USD")}
                        </div>
                    </div>
                </div>

                {/* PNL */}
                <div className="mt-5 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        PnL investments
                    </span>

                    <div className="text-right min-w-[110px] tabular-nums text-[12px]">
                        <div className={pnlPositive ? "text-emerald-400" : "text-red-400"}>
                            {pnlUsd >= 0 ? "+" : ""}
                            {formatCurrency(pnlUsd, "USD")}
                        </div>

                        <div className="mt-1 text-[12px] opacity-70">
                            {pnlPct >= 0 ? "+" : ""}
                            {formatPercent(pnlPct)}
                        </div>
                    </div>
                </div>
            </div>

            <nav className="mt-8 space-y-2">
                <div
                    onClick={() => setActiveView("dashboard")}
                    className={navClass("dashboard")}
                >
                    <div className="flex items-center gap-3">
                        <span className={dotClass("dashboard")} />
                        <span className="font-medium">Portfolio Jubilación</span>
                    </div>
                </div>

                <div
                    onClick={async () => {
                        setSelectedAssetMovements(null);
                        setActiveView("transactions");
                        await loadMovements();
                    }}
                    className={navClass("transactions")}
                >
                    <div className="flex items-center gap-3">
                        <span className={dotClass("transactions")} />
                        <span>Transacciones</span>
                    </div>
                </div>

                <div
                    onClick={async () => {
                        setActiveView("holdings");
                        await loadHoldings();
                    }}
                    className={navClass("holdings")}
                >
                    <div className="flex items-center gap-3">
                        <span className={dotClass("holdings")} />
                        <span>Holdings</span>
                    </div>
                </div>

                <div
                    onClick={async () => {
                        setActiveView("market");
                        await loadMarket();
                    }}
                    className={navClass("market")}
                >
                    <div className="flex items-center gap-3">
                        <span className={dotClass("market")} />
                        <span>Mercado</span>
                    </div>
                </div>

                <div
                    onClick={() => setActiveView("history")}
                    className={navClass("history")}
                >
                    <div className="flex items-center gap-3">
                        <span className={dotClass("history")} />
                        <span>Histórico</span>
                    </div>
                </div>
            </nav>

            <div className="mt-auto rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,15,34,0.98)_0%,rgba(5,8,24,0.98)_100%)] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
                <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <div className="text-sm font-medium uppercase tracking-[0.16em] text-slate-300">
                        Estado
                    </div>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-400">
                    Base lista para seguir creciendo con transacciones e histórico.
                </div>
            </div>
        </aside>
    );
}