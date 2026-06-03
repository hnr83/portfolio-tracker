import { useMemo, useState } from "react";

function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function todayString() {
    return new Date().toISOString().split("T")[0];
}

function formatNumber(value, digits = 6) {
    return new Intl.NumberFormat("es-AR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
    }).format(toNumber(value));
}

function formatUsd(value) {
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(toNumber(value));
}

export default function TradingTransferToInvestmentModal({
    open,
    balances = [],
    saving,
    error,
    onClose,
    onSubmit,
}) {
    const availableAssets = useMemo(() => {
        return balances
            .filter((row) => toNumber(row.quantity) > 0)
            .map((row) => ({
                exchange: row.exchange || "Bingx",
                asset: String(row.asset || "").toUpperCase(),
                quantity: toNumber(row.quantity),
                market_value_usd: toNumber(row.market_value_usd),
                price_usd: toNumber(row.price_usd),
            }));
    }, [balances]);

    const [form, setForm] = useState({
        movement_date: todayString(),
        exchange: "Bingx",
        asset: "",
        quantity: "",
        amount_usd: "",
        notes: "",
    });

    if (!open) return null;

    const selectedBalance = availableAssets.find(
        (row) =>
            row.asset === form.asset &&
            String(row.exchange || "Bingx") === String(form.exchange || "Bingx")
    );

    const availableQty = toNumber(selectedBalance?.quantity);
    const selectedPrice = toNumber(selectedBalance?.price_usd);
    const qty = toNumber(form.quantity);
    const amountUsd = toNumber(form.amount_usd);

    const impliedPrice = qty > 0 && amountUsd > 0 ? amountUsd / qty : 0;

    const updateField = (field, value) => {
        setForm((prev) => {
            const next = { ...prev, [field]: value };

            if (field === "asset") {
                const balance = availableAssets.find((row) => row.asset === value);
                next.exchange = balance?.exchange || "Bingx";
                next.quantity = "";
                next.amount_usd = "";
            }

            if (field === "quantity") {
                const numericQty = toNumber(value);
                const price = selectedPrice || 0;

                if (numericQty > 0 && price > 0) {
                    next.amount_usd = String(numericQty * price);
                }
            }

            return next;
        });
    };

    const handleMax = () => {
        if (!selectedBalance) return;

        setForm((prev) => ({
            ...prev,
            quantity: String(selectedBalance.quantity),
            amount_usd: String(selectedBalance.market_value_usd),
        }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        onSubmit({
            movement_date: form.movement_date,
            exchange: form.exchange || "Bingx",
            asset: form.asset,
            quantity: qty,
            amount_usd: amountUsd,
            notes: form.notes || null,
        });
    };

    const submitDisabled =
        saving ||
        !form.movement_date ||
        !form.asset ||
        qty <= 0 ||
        amountUsd <= 0 ||
        qty > availableQty;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
            <div className="my-4 max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-black/40 sm:my-0 sm:max-h-[calc(100vh-3rem)]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-violet-300">
                            Trading
                        </div>

                        <h2 className="mt-2 text-xl font-semibold text-slate-100">
                            Transferir a inversión
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            Pasa un asset desde trading al portfolio. El asset no cambia.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                    >
                        Cerrar
                    </button>
                </div>

                {error ? (
                    <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                        {error}
                    </div>
                ) : null}

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div>
                        <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Fecha
                        </label>
                        <input
                            type="date"
                            value={form.movement_date}
                            onChange={(e) => updateField("movement_date", e.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Asset
                        </label>
                        <select
                            value={form.asset}
                            onChange={(e) => updateField("asset", e.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                        >
                            <option value="">Seleccionar asset</option>
                            {availableAssets.map((row) => (
                                <option key={`${row.exchange}-${row.asset}`} value={row.asset}>
                                    {row.asset} · disponible {formatNumber(row.quantity, 8)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedBalance ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-sm">
                            <div className="flex justify-between text-slate-400">
                                <span>Disponible</span>
                                <span className="font-medium text-slate-200">
                                    {formatNumber(selectedBalance.quantity, 8)} {selectedBalance.asset}
                                </span>
                            </div>

                            <div className="mt-2 flex justify-between text-slate-400">
                                <span>Valuación</span>
                                <span className="font-medium text-slate-200">
                                    {formatUsd(selectedBalance.market_value_usd)}
                                </span>
                            </div>

                            <div className="mt-2 flex justify-between text-slate-400">
                                <span>Precio actual</span>
                                <span className="font-medium text-slate-200">
                                    {formatUsd(selectedBalance.price_usd)}
                                </span>
                            </div>
                        </div>
                    ) : null}

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <div>
                            <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                                Cantidad
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={form.quantity}
                                onChange={(e) => updateField("quantity", e.target.value)}
                                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                                placeholder="0.00"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleMax}
                            disabled={!selectedBalance || saving}
                            className="mt-7 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"
                        >
                            MAX
                        </button>
                    </div>

                    <div>
                        <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Valor USD
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={form.amount_usd}
                            onChange={(e) => updateField("amount_usd", e.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                            placeholder="0.00"
                        />
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-sm">
                        <div className="flex justify-between text-slate-400">
                            <span>Precio implícito</span>
                            <span className="font-medium text-slate-200">
                                {impliedPrice > 0 ? formatUsd(impliedPrice) : "-"}
                            </span>
                        </div>
                    </div>

                    {qty > availableQty ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                            No tenés saldo suficiente para transferir esa cantidad.
                        </div>
                    ) : null}

                    <div>
                        <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            Notas
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => updateField("notes", e.target.value)}
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-slate-600"
                            placeholder="Ej: Paso BTC ganado en trading al portfolio"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
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
                            disabled={submitDisabled}
                            className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-black hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "Guardando..." : "Transferir"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}