import { useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";

function money(value) {
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function pct(value) {
    return `${Number(value || 0).toFixed(2)}%`;
}

function ProgressBar({ value }) {
    const safeValue = Math.min(Math.max(Number(value || 0), 0), 100);

    return (
        <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span>Progreso objetivo</span>
                <span>{safeValue.toFixed(1)}%</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${safeValue}%` }}
                />
            </div>
        </div>
    );
}

function AssetCard({ asset }) {
    if (!asset) return null;

    const progress =
        asset.targetUsd > 0
            ? (asset.investedUsd / asset.targetUsd) * 100
            : 0;

    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                    {asset.asset}
                </h3>

                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                    Factor {asset.finalFactor?.toFixed(2)}x
                </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                    <p className="text-slate-500">Objetivo</p>
                    <p className="text-white">{money(asset.targetUsd)}</p>
                </div>

                <div>
                    <p className="text-slate-500">Invertido</p>
                    <p className="text-white">{money(asset.investedUsd)}</p>
                </div>

                <div>
                    <p className="text-slate-500">Pendiente</p>
                    <p className="text-white">{money(asset.remainingUsd)}</p>
                </div>

                <div>
                    <p className="text-slate-500">Compra semanal</p>
                    <p className="font-semibold text-emerald-400">
                        {money(asset.recommendedUsd)}
                    </p>
                </div>

                <div>
                    <p className="text-slate-500">Precio actual</p>
                    <p className="text-white">{money(asset.currentPrice)}</p>
                </div>

                <div>
                    <p className="text-slate-500">Precio base</p>
                    <p className="text-white">{money(asset.basePrice)}</p>
                </div>

                <div>
                    <p className="text-slate-500">Var. vs tesis</p>
                    <p className="text-white">
                        {pct(asset.priceChangePct)}
                    </p>
                </div>

                <div>
                    <p className="text-slate-500">Base semanal</p>
                    <p className="text-white">
                        {money(asset.baseWeeklyUsd)}
                    </p>
                </div>
            </div>

            <ProgressBar value={progress} />

            <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{money(asset.investedUsd)}</span>
                <span>{money(asset.targetUsd)}</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-400">
                <div className="rounded-xl bg-slate-900 p-2">
                    Precio
                    <br />
                    <span className="text-white">
                        {asset.priceFactor?.toFixed(2)}x
                    </span>
                </div>

                <div className="rounded-xl bg-slate-900 p-2">
                    Tiempo
                    <br />
                    <span className="text-white">
                        {asset.timeFactor?.toFixed(2)}x
                    </span>
                </div>

                <div className="rounded-xl bg-slate-900 p-2">
                    Final
                    <br />
                    <span className="text-white">
                        {asset.finalFactor?.toFixed(2)}x
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function DecisionMaker() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                setError("");

                const response = await apiFetch(
                    "/api/portfolio/decision-maker"
                );
                const result = await response.json();

                if (mounted) {
                    setData(result);
                }
            } catch (err) {
                console.error(err);

                if (mounted) {
                    setError("No se pudo cargar el Decision Maker");
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            mounted = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="p-4 text-slate-300">
                Cargando Decision Maker...
            </div>
        );
    }

    if (error) {
        return <div className="p-4 text-red-400">{error}</div>;
    }

    const btc = data?.assets?.BTC;
    const eth = data?.assets?.ETH;

    return (
        <div className="space-y-4 p-4 pb-24">
            <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Decision Maker
                </p>

                <h1 className="mt-1 text-2xl font-bold text-white">
                    Crypto Cycle 2026
                </h1>

                <p className="mt-1 text-sm text-slate-400">
                    Acumulación hasta {data?.endDate} ·{" "}
                    {data?.weeksRemaining} semanas restantes
                </p>
            </div>

            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                    Comprar esta semana
                </p>

                <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                        <p className="text-sm text-slate-400">BTC</p>

                        <p className="text-xl font-bold text-white">
                            {money(data?.weeklyRecommendation?.BTC)}
                        </p>
                    </div>

                    <div>
                        <p className="text-sm text-slate-400">ETH</p>

                        <p className="text-xl font-bold text-white">
                            {money(data?.weeklyRecommendation?.ETH)}
                        </p>
                    </div>

                    <div>
                        <p className="text-sm text-slate-400">Total</p>

                        <p className="text-xl font-bold text-emerald-400">
                            {money(data?.weeklyRecommendation?.totalUsd)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-500">
                        Capital tesis
                    </p>

                    <p className="mt-1 text-xl font-bold text-white">
                        {money(data?.totalThesisCapitalUsd)}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-500">
                        Desplegado
                    </p>

                    <p className="mt-1 text-xl font-bold text-white">
                        {money(data?.deployedUsd)}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-500">
                        Liquidez + trading
                    </p>

                    <p className="mt-1 text-xl font-bold text-white">
                        {money(
                            Number(data?.liquidityUsd || 0) +
                                Number(data?.tradingUsd || 0)
                        )}
                    </p>
                </div>
            </div>

            <AssetCard asset={btc} />
            <AssetCard asset={eth} />

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-white">
                    Motivos
                </p>

                <ul className="mt-3 space-y-2 text-sm text-slate-400">
                    {data?.reasons?.map((reason) => (
                        <li key={reason}>• {reason}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

