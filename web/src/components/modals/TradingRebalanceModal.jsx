import { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
    movement_date: new Date().toISOString().split("T")[0],
    exchange: "Bingx",
    from_asset: "USDT",
    to_asset: "BTC",
    from_quantity: "",
    to_quantity: "",
    amount_usd: "",
    notes: "",
};

const ASSETS = ["USDT", "BTC", "ETH", "ADA", "SOL"];

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, digits = 6) {
    const n = toNumber(value);

    return new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(n);
}

export default function TradingRebalanceModal({
    open,
    saving,
    error,
    onClose,
    onSubmit,
}) {
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        if (!open) {
            setForm(EMPTY_FORM);
        }
    }, [open]);

    const impliedPrice = useMemo(() => {
        const usd = toNumber(form.amount_usd);
        const qty = toNumber(form.to_quantity);

        if (!usd || !qty) return 0;

        return usd / qty;
    }, [form.amount_usd, form.to_quantity]);

    if (!open) return null;

    const handleChange = (field, value) => {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        await onSubmit({
            ...form,
            from_quantity: Number(form.from_quantity || 0),
            to_quantity: Number(form.to_quantity || 0),
            amount_usd: Number(form.amount_usd || 0),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-100">
                            Rebalancear Trading
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Conversión interna entre assets de trading.
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                    >
                        Cerrar
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Fecha
                            </label>

                            <input
                                type="date"
                                value={form.movement_date}
                                onChange={(e) =>
                                    handleChange("movement_date", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Exchange
                            </label>

                            <input
                                value={form.exchange}
                                onChange={(e) =>
                                    handleChange("exchange", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Desde
                            </label>

                            <select
                                value={form.from_asset}
                                onChange={(e) =>
                                    handleChange("from_asset", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            >
                                {ASSETS.map((asset) => (
                                    <option key={asset} value={asset}>
                                        {asset}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Hacia
                            </label>

                            <select
                                value={form.to_asset}
                                onChange={(e) =>
                                    handleChange("to_asset", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            >
                                {ASSETS.map((asset) => (
                                    <option key={asset} value={asset}>
                                        {asset}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Cantidad origen
                            </label>

                            <input
                                type="number"
                                step="any"
                                value={form.from_quantity}
                                onChange={(e) =>
                                    handleChange("from_quantity", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Cantidad destino
                            </label>

                            <input
                                type="number"
                                step="any"
                                value={form.to_quantity}
                                onChange={(e) =>
                                    handleChange("to_quantity", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-slate-400">
                                Valor USD
                            </label>

                            <input
                                type="number"
                                step="any"
                                value={form.amount_usd}
                                onChange={(e) =>
                                    handleChange("amount_usd", e.target.value)
                                }
                                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                            />
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <div className="text-sm text-slate-500">
                            Precio implícito
                        </div>

                        <div className="mt-2 text-2xl font-semibold text-cyan-300">
                            {formatNumber(impliedPrice, 2)}
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-slate-400">
                            Notas
                        </label>

                        <textarea
                            rows={3}
                            value={form.notes}
                            onChange={(e) =>
                                handleChange("notes", e.target.value)
                            }
                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                        />
                    </div>

                    {error ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
                        >
                            {saving ? "Guardando..." : "Guardar rebalanceo"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}