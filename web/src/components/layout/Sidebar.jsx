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
  authUser,
  onLogout,
}) {
  const handleNavigate = async (view, callback) => {
    setActiveView(view);

    if (callback) {
      await callback();
    }
  };

  const navClass = (view) =>
    `group cursor-pointer rounded-2xl px-4 py-3 transition-all duration-200 ${
      activeView === view
        ? "border border-indigo-500/20 bg-[linear-gradient(90deg,rgba(93,124,250,0.18)_0%,rgba(93,124,250,0.08)_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        : "text-slate-400 hover:bg-slate-900/70 hover:text-white"
    }`;

  const dotClass = (view) =>
    `h-2 w-2 rounded-full transition-all ${
      activeView === view
        ? "bg-indigo-400"
        : "bg-slate-700 group-hover:bg-slate-500"
    }`;

  const mobileNavClass = (view) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] transition ${
      activeView === view
        ? "bg-indigo-500/15 text-indigo-300"
        : "text-slate-400"
    }`;

  const totalUsd = Number(summary?.total_with_trading_usd || 0);
  const totalArs = Number(summary?.total_with_trading_ars || 0);
  const investmentsUsd = Number(summary?.investments_market_usd || 0);

  const pnlUsd = Number(summary?.total_pnl_usd || 0);
  const pnlPct = Number(summary?.total_pnl_pct || 0);
  const pnlPositive = pnlUsd >= 0;

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-r border-slate-800/80 bg-[#020617] px-5 py-6 xl:flex">
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

          <div className="mt-5 whitespace-nowrap text-[24px] font-semibold leading-tight tracking-tight text-white sm:text-[27px]">
            {formatCurrency(totalUsd, "USD")}
          </div>

          <div className="mt-3 text-[15px] text-slate-400">
            {formatCurrency(totalArs, "ARS")}
          </div>

          <div className="mt-5 h-px bg-white/[0.08]" />

          <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Investments
            </span>

            <div className="min-w-[110px] text-right">
              <div className="tabular-nums text-slate-200">
                {formatCurrency(investmentsUsd, "USD")}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              PnL investments
            </span>

            <div className="min-w-[110px] text-right text-[12px] tabular-nums">
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
            onClick={() => handleNavigate("dashboard")}
            className={navClass("dashboard")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("dashboard")} />
              <span className="font-medium">Portfolio Jubilación</span>
            </div>
          </div>

          <div
            onClick={() => handleNavigate("holdings", loadHoldings)}
            className={navClass("holdings")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("holdings")} />
              <span>Holdings</span>
            </div>
          </div>

          <div
            onClick={() => handleNavigate("market", loadMarket)}
            className={navClass("market")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("market")} />
              <span>Mercado</span>
            </div>
          </div>

          <div
            onClick={() => handleNavigate("history")}
            className={navClass("history")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("history")} />
              <span>Histórico</span>
            </div>
          </div>

          <div
            onClick={() =>
              handleNavigate("transactions", async () => {
                setSelectedAssetMovements(null);
                await loadMovements();
              })
            }
            className={navClass("transactions")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("transactions")} />
              <span>Transacciones</span>
            </div>
          </div>

          <div
            onClick={() => handleNavigate("trading")}
            className={navClass("trading")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("trading")} />
              <span>Trading</span>
            </div>
          </div>

          <div
            onClick={() => handleNavigate("performance")}
            className={navClass("performance")}
          >
            <div className="flex items-center gap-3">
              <span className={dotClass("performance")} />
              <span>Performance</span>
            </div>
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-800 pt-6">
          <div className="flex items-center gap-3">
            {authUser?.picture ? (
              <img
                src={authUser.picture}
                alt={authUser?.name || "Usuario"}
                className="h-9 w-9 rounded-full border border-slate-700"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm text-slate-300">
                {authUser?.email?.[0]?.toUpperCase() || "U"}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-200">
                {authUser?.name || "Usuario"}
              </div>
              <div className="truncate text-xs text-slate-500">
                {authUser?.email || ""}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mt-4 w-full rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <nav className="fixed bottom-3 left-3 right-3 z-50 flex items-center gap-1 rounded-[26px] border border-slate-700/70 bg-[#020617]/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl xl:hidden">
        <button
          type="button"
          onClick={() => handleNavigate("dashboard")}
          className={mobileNavClass("dashboard")}
        >
          <span className="text-lg">⌂</span>
          <span className="truncate">Inicio</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate("holdings", loadHoldings)}
          className={mobileNavClass("holdings")}
        >
          <span className="text-lg">◫</span>
          <span className="truncate">Holdings</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate("market", loadMarket)}
          className={mobileNavClass("market")}
        >
          <span className="text-lg">◎</span>
          <span className="truncate">Mercado</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate("history")}
          className={mobileNavClass("history")}
        >
          <span className="text-lg">↗</span>
          <span className="truncate">Histórico</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate("trading")}
          className={mobileNavClass("trading")}
        >
          <span className="text-lg">₿</span>
          <span className="truncate">Trading</span>
        </button>
      </nav>
    </>
  );
}