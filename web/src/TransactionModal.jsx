import { useMemo, useState } from "react";

const FAMILY_OPTIONS = [
  { value: "CASH_USD", label: "Cash USD" },
  { value: "FX_USD", label: "Compra / venta USD" },
  { value: "USDT", label: "Compra / venta USDT" },
  { value: "ASSET", label: "Acciones / CEDEARs / ETFs / Cripto asset" },
];

const ACTION_OPTIONS = {
  CASH_USD: [
    { value: "IN", label: "Ingreso" },
    { value: "OUT", label: "Gasto" },
  ],
  FX_USD: [
    { value: "BUY", label: "Compra" },
    { value: "SELL", label: "Venta" },
  ],
  USDT: [
    { value: "BUY", label: "Compra" },
    { value: "SELL", label: "Venta" },
  ],
  ASSET: [
    { value: "BUY", label: "Compra" },
    { value: "SELL", label: "Venta" },
  ],
};

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function buildPreview(form) {
  const quantity = toNumber(form.quantity);
  const grossAmount = toNumber(form.gross_amount);

  if (!form.fecha || grossAmount === null) return null;

  const base = {
    source_table: "manual",
    fecha: form.fecha,
    owner: form.owner?.trim() || null,
    broker: form.broker?.trim() || null,
    description: form.description?.trim() || null,
  };

  if (form.family === "CASH_USD") {
    const isExpense = form.action === "OUT";
    return {
      ...base,
      movement_type: isExpense ? "EXPENSE_USD" : "INCOME_USD",
      category: "CASH",
      ticker: "USD",
      instrument_type: "USD",
      side: form.action,
      quantity: null,
      unit_price: null,
      price_currency: "USD",
      gross_amount: isExpense ? -Math.abs(grossAmount) : Math.abs(grossAmount),
      net_amount: isExpense ? -Math.abs(grossAmount) : Math.abs(grossAmount),
      settlement_currency: "USD",
      fx_rate: null,
    };
  }

  if (form.family === "FX_USD") {
    if (quantity === null || quantity <= 0) return null;
    const fxRate = grossAmount / quantity;

    return {
      ...base,
      movement_type: form.action === "BUY" ? "BUY_USD" : "SELL_USD",
      category: "FX",
      ticker: "USD",
      instrument_type: "USD",
      side: form.action,
      quantity,
      unit_price: fxRate,
      price_currency: "ARS",
      gross_amount,
      net_amount: grossAmount,
      settlement_currency: "ARS",
      fx_rate: fxRate,
    };
  }

  if (form.family === "USDT") {
    if (quantity === null || quantity <= 0) return null;
    const fxRate = grossAmount / quantity;

    return {
      ...base,
      movement_type: form.action === "BUY" ? "BUY_USDT" : "SELL_USDT",
      category: "CRYPTO",
      ticker: "USDT",
      instrument_type: "USDT",
      side: form.action,
      quantity,
      unit_price: fxRate,
      price_currency: "ARS",
      gross_amount: grossAmount,
      net_amount: grossAmount,
      settlement_currency: "ARS",
      fx_rate: fxRate,
    };
  }

  if (form.family === "ASSET") {
    if (!form.ticker.trim() || quantity === null || quantity <= 0) return null;

    return {
      ...base,
      movement_type: form.action === "BUY" ? "BUY_ASSET" : "SELL_ASSET",
      category: "PORTFOLIO",
      ticker: form.ticker.trim(),
      instrument_type: "ASSET",
      side: form.action,
      quantity,
      unit_price: null,
      price_currency: "USD",
      gross_amount: grossAmount,
      net_amount: grossAmount,
      settlement_currency: "USD",
      fx_rate: null,
    };
  }

  return null;
}

export default function TransactionModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState({
    family: "USDT",
    action: "BUY",
    fecha: new Date().toISOString().slice(0, 10),
    ticker: "",
    quantity: "",
    gross_amount: "",
    broker: "",
    owner: "",
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const actionOptions = ACTION_OPTIONS[form.family] || [];
  const preview = useMemo(() => buildPreview(form), [form]);

  if (!isOpen) return null;

  function handleChange(e) {
    const { name, value } = e.target;

    if (name === "family") {
      const nextAction = ACTION_OPTIONS[value]?.[0]?.value || "BUY";
      setForm((prev) => ({
        ...prev,
        family: value,
        action: nextAction,
        ticker: value === "ASSET" ? prev.ticker : "",
        description: value === "CASH_USD" ? prev.description : "",
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function resetForm() {
    setForm({
      family: "USDT",
      action: "BUY",
      fecha: new Date().toISOString().slice(0, 10),
      ticker: "",
      quantity: "",
      gross_amount: "",
      broker: "",
      owner: "",
      description: "",
    });
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!preview) {
      setError("Completá los campos obligatorios para generar una preview válida.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        family: form.family,
        action: form.action,
        fecha: form.fecha,
        ticker: form.ticker.trim(),
        quantity: form.quantity === "" ? null : toNumber(form.quantity),
        gross_amount: toNumber(form.gross_amount),
        broker: form.broker.trim() || null,
        owner: form.owner.trim() || null,
        description: form.description.trim() || null,
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Error al guardar transacción");
      }

      onSaved?.();
      resetForm();
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al guardar transacción");
    } finally {
      setLoading(false);
    }
  }

  const amountLabel =
    form.family === "CASH_USD" || form.family === "ASSET" ? "Monto USD" : "Monto ARS";

  const quantityLabel =
    form.family === "FX_USD"
      ? "Cantidad USD"
      : form.family === "USDT"
      ? "Cantidad USDT"
      : "Cantidad";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Nueva transacción</h2>
            <p className="mt-1 text-sm text-slate-400">
              Elegís familia y acción, y abajo ves la preview exacta de lo que se insertará en movements.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose?.();
            }}
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-400">Familia</label>
              <select
                name="family"
                value={form.family}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-slate-600"
              >
                {FAMILY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-400">Acción</label>
              <select
                name="action"
                value={form.action}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-slate-600"
              >
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-400">Fecha</label>
                <input
                  type="date"
                  name="fecha"
                  value={form.fecha}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-slate-600"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-400">Broker</label>
                <input
                  type="text"
                  name="broker"
                  value={form.broker}
                  onChange={handleChange}
                  placeholder="Ej: IBKR, Cocos, Ledger"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-400">Titular</label>
                <input
                  type="text"
                  name="owner"
                  value={form.owner}
                  onChange={handleChange}
                  placeholder="Ej: Horacio, Vale"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                />
              </div>

              {form.family !== "CASH_USD" && (
                <div>
                  <label className="mb-2 block text-sm text-slate-400">{quantityLabel}</label>
                  <input
                    type="number"
                    step="any"
                    name="quantity"
                    value={form.quantity}
                    onChange={handleChange}
                    placeholder="Ej: 10 / 1500 / 0.25"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                    required={form.family !== "CASH_USD"}
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm text-slate-400">{amountLabel}</label>
                <input
                  type="number"
                  step="any"
                  name="gross_amount"
                  value={form.gross_amount}
                  onChange={handleChange}
                  placeholder="Ej: 500 / 1500000"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                  required
                />
              </div>

              {form.family === "ASSET" && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-slate-400">Ticker</label>
                  <input
                    type="text"
                    name="ticker"
                    value={form.ticker}
                    onChange={handleChange}
                    placeholder="Ej: BATS:ARKG, BCBA:TSLA, CURRENCY:ETHARS"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                    required
                  />
                </div>
              )}

              {form.family === "CASH_USD" && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-slate-400">Descripción</label>
                  <input
                    type="text"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Ej: pago tarjeta, sueldo, transferencia"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-5">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onClose?.();
                }}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
                disabled={loading}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 text-lg font-semibold text-white">
              Preview de inserción en movements
            </div>
            <div className="mb-4 text-sm text-slate-400">
              Esta preview replica la transformación que hará el backend.
            </div>

            <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">
{JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        </form>
      </div>
    </div>
  );
}