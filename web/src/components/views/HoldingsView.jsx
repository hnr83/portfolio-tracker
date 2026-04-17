import React from "react";

export default function HoldingsView({
    holdings,
    formatNumber,
    formatCurrency,
    SectionShell,
}) {
    return (
        <SectionShell className="mt-8">
            <div className="mb-5">
                <h2 className="text-2xl font-semibold text-white">Holdings</h2>
                <p className="mt-1 text-sm text-slate-400">
                    Posiciones agregadas por activo
                </p>
            </div>

            <div className="overflow-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                <table className="w-full text-sm">
                    <thead className="bg-slate-950/95 text-slate-400">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                                Ticker
                            </th>
                            <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                                Categoría
                            </th>
                            <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                                Cantidad
                            </th>
                            <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                                Valor USD
                            </th>
                            <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                                PnL
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {holdings.map((h, i) => (
                            <tr
                                key={i}
                                className="border-t border-slate-800/80 transition-colors hover:bg-slate-800/20"
                            >
                                <td className="px-4 py-4 font-semibold text-white">
                                    {h.normalized_ticker || h.ticker}
                                </td>
                                <td className="px-4 py-4">{h.category}</td>
                                <td className="px-4 py-4 text-right tabular-nums">
                                    {formatNumber(h.quantity_net, 4)}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums">
                                    {formatCurrency(h.market_value_usd, "USD")}
                                </td>
                                <td
                                    className={`px-4 py-4 text-right font-semibold tabular-nums ${h.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                >
                                    {formatCurrency(h.pnl_usd, "USD")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionShell>
    );
}