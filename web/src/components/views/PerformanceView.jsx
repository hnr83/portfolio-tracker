import { useEffect, useMemo, useState } from "react";
import { RangeBar } from "../shared/charts/RangeBar";
import { Sparkline } from "../shared/charts/Sparkline";
import AssetAvatar from "../shared/AssetAvatar";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function apiFetch(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("Falta configurar VITE_API_BASE_URL");
  }

  const token = window.localStorage.getItem("portfolio-auth-token");

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function cleanTicker(ticker) {
  if (!ticker) return "-";

  if (ticker.startsWith("BATS:")) {
    return ticker.split(":")[1];
  }

  if (ticker.startsWith("CURRENCY:")) {
    return ticker.replace("CURRENCY:", "").replace("ARS", "");
  }

  return ticker;
}

function formatPrice(value) {
    const n = Number(value || 0);

    if (n >= 1000) {
        return n.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    if (n >= 1) {
        return n.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    return n.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
    });
}

function getSignal(row) {
    const position = Number(row.position_range ?? 0);
    const return7d = Number(row.return_7d ?? 0);

    if (position < 0.4 && return7d > 0.02) {
        return {
            label: "BUY",
            className:
                "border-emerald-400/20 bg-emerald-400/10 text-emerald-400",
        };
    }

    if (position > 0.85 && return7d < 0) {
        return {
            label: "SELL",
            className: "border-red-400/20 bg-red-400/10 text-red-400",
        };
    }

    return {
        label: "WATCH",
        className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    };
}

export default function PerformanceView() {
    const [data, setData] = useState([]);

    useEffect(() => {
        apiFetch("/api/portfolio/performance")
            .then((res) => res.json())
            .then((json) => setData(json.data || []))
            .catch(() => setData([]));
    }, []);

    const rows = useMemo(() => {
        return data.filter((row) => {
            const ticker = String(row.ticker || "").toUpperCase();
            const internalTicker = String(row.internal_ticker || "").toUpperCase();

            return ticker !== "USDT" && internalTicker !== "USDT";
        });
    }, [data]);

    return (
        <section className="rounded-[28px] border border-slate-800/80 bg-slate-950/40">
            <div className="flex flex-col gap-4 border-b border-slate-800/80 px-6 py-6 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white">
                        Performance
                    </h1>

                    <p className="mt-2 text-sm text-slate-400">
                        Indicadores de momentum, rango disponible y score por activo.
                    </p>

                    <div className="mt-5 text-sm text-slate-400">
                        {rows.length} resultados
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto px-6 pb-6">
                <table className="w-full min-w-[1120px] table-fixed text-sm">
                    <thead className="border-b border-slate-800 text-left text-[12px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                            <th className="w-[190px] px-3 py-4">Ticker</th>
                            <th className="w-[120px] px-3 py-4 text-right">Precio</th>
                            <th className="w-[150px] px-3 py-4 text-center">Trend</th>
                            <th className="w-[90px] px-3 py-4 text-right">7d</th>
                            <th className="w-[260px] px-3 py-4">Rango disponible</th>
                            <th className="w-[80px] px-3 py-4 text-right">Días</th>
                            <th className="w-[120px] px-3 py-4 text-center">Signal</th>

                            <th className="w-[100px] px-3 py-4 text-right">
                                <div className="group relative inline-flex cursor-help items-center gap-1">
                                    <span>Score</span>
                                    <span className="text-slate-500">ⓘ</span>

                                    <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left text-[11px] normal-case tracking-normal text-slate-300 shadow-xl group-hover:block">
                                        <div className="mb-1 font-semibold text-white">
                                            Performance Score
                                        </div>

                                        <div className="space-y-1">
                                            <div>• 📈 Momentum 7d (60%)</div>
                                            <div>• 📊 Posición en rango (25%)</div>
                                            <div>• ⚠️ Volatilidad (−15%)</div>
                                        </div>

                                        <div className="mt-2 border-t border-slate-700 pt-2 text-[10px] text-slate-400">
                                            Mide la fortaleza del activo considerando tendencia,
                                            ubicación en su rango y riesgo.
                                        </div>
                                    </div>
                                </div>
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {rows.map((row) => {
                            const ticker = cleanTicker(row.ticker);
                            const return7d = Number(row.return_7d || 0);
                            const score = Number(row.performance_score || 0) * 100;
                            const signal = getSignal(row);

                            return (
                                <tr
                                    key={row.ticker}
                                    className="border-b border-slate-800/80 transition hover:bg-slate-900/60"
                                >
                                    <td className="w-[190px] px-3 py-5">
                                        <div className="flex items-center gap-3">
                                            <AssetAvatar
                                                ticker={row.ticker}
                                                normalizedTicker={ticker}
                                                size={28}
                                                showText={false}
                                            />

                                            <div className="min-w-0">
                                                <div className="font-medium text-white">
                                                    {ticker}
                                                </div>

                                                {String(row.ticker).includes(":") ? (
                                                    <div className="text-xs text-slate-500">
                                                        {row.ticker}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-3 py-5 text-right tabular-nums text-slate-100">
                                        {formatPrice(row.current_price)}
                                    </td>

                                    <td className="px-3 py-5">
                                        <div className="flex justify-center">
                                            <Sparkline points={row.trend_points || []} />
                                        </div>
                                    </td>

                                    <td
                                        className={`w-[90px] px-3 py-5 text-right tabular-nums ${return7d >= 0 ? "text-emerald-400" : "text-red-400"
                                            }`}
                                    >
                                        {(return7d * 100).toFixed(2)}%
                                    </td>

                                    <td className="w-[260px] px-3 py-5">
                                        <div className="w-full">
                                            <RangeBar
                                                low={row.low_range}
                                                high={row.high_range}
                                                position={row.position_range}
                                            />
                                        </div>
                                    </td>

                                    <td className="px-3 py-5 text-right tabular-nums text-slate-400">
                                        {row.days_with_price ?? "-"}
                                    </td>

                                    <td className="px-3 py-5 text-center">
                                        <span
                                            className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold tracking-wide ${signal.className}`}
                                        >
                                            {signal.label}
                                        </span>
                                    </td>

                                    <td
                                        className={`px-3 py-5 text-right tabular-nums ${score >= 0 ? "text-emerald-400" : "text-red-400"
                                            }`}
                                    >
                                        {Math.abs(score) < 0.01 ? "0.00" : score.toFixed(2)}
                                    </td>
                                </tr>
                            );
                        })}

                        {rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={8}
                                    className="py-10 text-center text-sm text-slate-500"
                                >
                                    No hay datos de performance disponibles.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}