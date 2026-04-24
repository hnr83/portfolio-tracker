import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatNumberDisplay } from "./utils/formatters";

const FAMILY_OPTIONS = [
  { value: "CASH_USD", label: "Cash USD" },
  { value: "FX_USD", label: "Compra / venta USD" },
  { value: "USDT", label: "Compra / venta USDT" },
  { value: "ASSET", label: "Acciones / CEDEARs / ETFs / Cripto asset" },
  { value: "SWAP", label: "Swap cripto ↔ USDT" },
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

const SWAP_TICKERS = ["USDT", "BTC", "ETH", "SOL", "RON"];

const BROKER_OPTIONS = [
  "BMB",
  "BMB Vale",
  "Binance",
  "Cocos",
  "Cocos Vale",
  "Etoro",
  "IBKR",
  "Ledger",
  "Ledger 2",
  "Ledger Flex",
];

const OWNER_OPTIONS = ["Horacio", "Vale"];

const TICKER_OPTIONS = [
  "BATS:ARKG",
  "BATS:ARKK",
  "AAPL",
  "GOOGL",
  "TSLA",
  "MELI",
  "BCBA:TSLA",
  "BCBA:GOOGL",
  "CURRENCY:BTCARS",
  "CURRENCY:ETHARS",
  "USDT",
];

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function buildPayload(form) {
  if (form.family === "SWAP") {
    return {
      family: "SWAP",
      fecha: form.fecha,
      from_ticker: form.from_ticker,
      from_quantity: toNumber(form.from_quantity),
      to_ticker: form.to_ticker,
      to_quantity: toNumber(form.to_quantity),
      gross_amount: toNumber(form.gross_amount),
      broker: form.broker.trim() || null,
      owner: form.owner.trim() || null,
      description: form.description.trim() || null,
    };
  }

  return {
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
}

function isPreviewReady(form) {
  if (!form.fecha) return false;

  if (form.family === "SWAP") {
    return (
      !!form.from_ticker &&
      !!form.to_ticker &&
      form.from_ticker !== form.to_ticker &&
      (form.from_ticker === "USDT" || form.to_ticker === "USDT") &&
      toNumber(form.from_quantity) > 0 &&
      toNumber(form.to_quantity) > 0 &&
      toNumber(form.gross_amount) > 0
    );
  }

  if (toNumber(form.gross_amount) === null) return false;

  if (["FX_USD", "USDT", "ASSET"].includes(form.family)) {
    if (toNumber(form.quantity) === null || toNumber(form.quantity) <= 0) {
      return false;
    }
  }

  if (form.family === "ASSET" && !form.ticker.trim()) {
    return false;
  }

  return true;
}

export default function TransactionModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState({
    family: "USDT",
    action: "BUY",
    fecha: new Date().toISOString().slice(0, 10),

    ticker: "",
    quantity: "",
    gross_amount: "",

    from_ticker: "USDT",
    to_ticker: "BTC",
    from_quantity: "",
    to_quantity: "",

    broker: "",
    owner: "",
    description: "",
  });

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isConfirmStep, setIsConfirmStep] = useState(false);

  const actionOptions = ACTION_OPTIONS[form.family] || [];
  const previewCanRun = useMemo(() => isPreviewReady(form), [form]);

  const previewRows = Array.isArray(preview) ? preview : preview ? [preview] : [];
  const primaryPreview = previewRows[0] || null;

  function handleChange(e) {
    const { name, value } = e.target;

    setIsConfirmStep(false);
    setError("");
    setPreviewError("");

    if (name === "family") {
      const nextAction = ACTION_OPTIONS[value]?.[0]?.value || "BUY";

      setForm((prev) => ({
        ...prev,
        family: value,
        action: value === "SWAP" ? "" : nextAction,
        ticker: value === "ASSET" ? prev.ticker : "",
        quantity: value === "SWAP" ? "" : prev.quantity,
        description: value === "CASH_USD" || value === "SWAP" ? prev.description : "",
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
      from_ticker: "USDT",
      to_ticker: "BTC",
      from_quantity: "",
      to_quantity: "",
      broker: "",
      owner: "",
      description: "",
    });
    setPreview(null);
    setPreviewError("");
    setError("");
    setIsConfirmStep(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    if (!previewCanRun) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(async () => {
      try {
        setPreviewLoading(true);
        setPreviewError("");

        const payload = buildPayload(form);

        const res = await fetch("/api/transactions/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Error al generar preview");
        }

        setPreview(data?.preview || null);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setPreview(null);
        setPreviewError(err.message || "Error al generar preview");
      } finally {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [form, isOpen, previewCanRun]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!previewCanRun) {
      setError("Completá los campos obligatorios para generar una preview válida.");
      return;
    }

    if (previewLoading) {
      setError("Esperá a que termine de generarse la preview.");
      return;
    }

    if (!preview) {
      setError("No hay una preview válida para guardar.");
      return;
    }

    if (!isConfirmStep) {
      setIsConfirmStep(true);
      return;
    }

    setLoading(true);

    try {
      const payload = buildPayload(form);

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

      await onSaved?.();
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
    form.family === "CASH_USD" || form.family === "ASSET" || form.family === "SWAP"
      ? "Monto USD"
      : "Monto ARS";

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
              Elegís familia y acción, y a la derecha ves la preview exacta que devolverá el backend.
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

            {form.family !== "SWAP" && (
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
            )}

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
                  list="broker-options"
                  value={form.broker}
                  onChange={handleChange}
                  placeholder="Ej: IBKR, Cocos, Ledger"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                />
                <datalist id="broker-options">
                  {BROKER_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-400">Titular</label>
                <input
                  type="text"
                  name="owner"
                  list="owner-options"
                  value={form.owner}
                  onChange={handleChange}
                  placeholder="Ej: Horacio, Vale"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                />
                <datalist id="owner-options">
                  {OWNER_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>

              {form.family !== "CASH_USD" && form.family !== "SWAP" && (
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
                  {toNumber(form.quantity) !== null && (
                    <div className="mt-2 text-xs text-slate-500">
                      {formatNumberDisplay(form.quantity, 4)}
                    </div>
                  )}
                </div>
              )}

              {form.family === "SWAP" && (
                <>
                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Desde</label>
                    <select
                      name="from_ticker"
                      value={form.from_ticker}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-slate-600"
                    >
                      {SWAP_TICKERS.map((ticker) => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Cantidad origen</label>
                    <input
                      type="number"
                      step="any"
                      name="from_quantity"
                      value={form.from_quantity}
                      onChange={handleChange}
                      placeholder="Ej: 1000"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                    />
                    {toNumber(form.from_quantity) !== null && (
                      <div className="mt-2 text-xs text-slate-500">
                        {formatNumberDisplay(form.from_quantity, 6)}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Hacia</label>
                    <select
                      name="to_ticker"
                      value={form.to_ticker}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-slate-600"
                    >
                      {SWAP_TICKERS.map((ticker) => (
                        <option key={ticker} value={ticker}>
                          {ticker}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Cantidad destino</label>
                    <input
                      type="number"
                      step="any"
                      name="to_quantity"
                      value={form.to_quantity}
                      onChange={handleChange}
                      placeholder="Ej: 0.4"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                    />
                    {toNumber(form.to_quantity) !== null && (
                      <div className="mt-2 text-xs text-slate-500">
                        {formatNumberDisplay(form.to_quantity, 6)}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className={form.family === "SWAP" ? "md:col-span-2" : ""}>
                <label className="mb-2 block text-sm text-slate-400">{amountLabel}</label>
                <input
                  type="number"
                  step="any"
                  name="gross_amount"
                  value={form.gross_amount}
                  onChange={handleChange}
                  placeholder={form.family === "SWAP" ? "Monto USD referencia" : "Ej: 500 / 1500000"}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                  required
                />
                {toNumber(form.gross_amount) !== null && (
                  <div className="mt-2 text-xs text-slate-500">
                    {form.family === "FX_USD" || form.family === "USDT"
                      ? formatMoney(form.gross_amount, "ARS")
                      : formatMoney(form.gross_amount, "USD")}
                  </div>
                )}
              </div>

              {form.family === "ASSET" && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-slate-400">Ticker</label>
                  <input
                    type="text"
                    name="ticker"
                    list="ticker-options"
                    value={form.ticker}
                    onChange={handleChange}
                    placeholder="Ej: BATS:ARKG, BCBA:TSLA, CURRENCY:ETHARS"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                    required
                  />
                  <datalist id="ticker-options">
                    {TICKER_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
              )}

              {(form.family === "CASH_USD" || form.family === "SWAP") && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-slate-400">Descripción</label>
                  <input
                    type="text"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder={
                      form.family === "SWAP"
                        ? "Ej: swap ETH a USDT"
                        : "Ej: pago tarjeta, sueldo, transferencia"
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-slate-600"
                  />
                </div>
              )}
            </div>

            {form.family === "SWAP" &&
              form.from_ticker &&
              form.to_ticker &&
              form.from_ticker === form.to_ticker && (
                <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  En un SWAP, origen y destino no pueden ser iguales.
                </div>
              )}

            {form.family === "SWAP" &&
              form.from_ticker &&
              form.to_ticker &&
              form.from_ticker !== form.to_ticker &&
              form.from_ticker !== "USDT" &&
              form.to_ticker !== "USDT" && (
                <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  El SWAP solo permite conversiones entre USDT y BTC/ETH/SOL/RON.
                </div>
              )}

            {isConfirmStep && (
              <div className="rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
                Revisá bien los datos. Al confirmar, la transacción se insertará en movements.
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-5">
              <button
                type="button"
                onClick={() => {
                  if (isConfirmStep) {
                    setIsConfirmStep(false);
                    return;
                  }

                  resetForm();
                  onClose?.();
                }}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
                disabled={loading}
              >
                {isConfirmStep ? "Volver a editar" : "Cancelar"}
              </button>

              <button
                type="submit"
                className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50 ${
                  isConfirmStep
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-blue-600 hover:bg-blue-500"
                }`}
                disabled={loading || previewLoading}
              >
                {loading
                  ? "Guardando..."
                  : isConfirmStep
                    ? "Confirmar y guardar"
                    : "Revisar transacción"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 text-lg font-semibold text-white">
              Preview de inserción en movements
            </div>

            <div className="mb-4 text-sm text-slate-400">
              Esta preview ahora viene del backend y usa la misma lógica que la inserción real.
            </div>

            {previewRows.length > 1 && (
              <div className="mb-4 rounded-xl border border-indigo-900 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-200">
                Esta operación generará {previewRows.length} movimientos en <span className="font-semibold">movements</span>.
              </div>
            )}

            {preview && !previewLoading && !previewError && (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Movimiento
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {primaryPreview?.movement_type || "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Categoría
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {primaryPreview?.category || "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    FX implícito
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {primaryPreview?.fx_rate != null
                      ? formatNumberDisplay(primaryPreview.fx_rate, 2)
                      : "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Monto
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {primaryPreview?.gross_amount != null
                      ? primaryPreview?.price_currency === "ARS"
                        ? formatMoney(primaryPreview.gross_amount, "ARS")
                        : formatMoney(primaryPreview.gross_amount, "USD")
                      : "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Cantidad
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {primaryPreview?.quantity != null
                      ? formatNumberDisplay(primaryPreview.quantity, 4)
                      : "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Ticker
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {primaryPreview?.ticker || "-"}
                  </div>
                </div>
              </div>
            )}

            {previewLoading ? (
              <div className="rounded-xl bg-slate-950 p-4 text-sm text-slate-400">
                Generando preview...
              </div>
            ) : previewError ? (
              <div className="rounded-xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-300">
                {previewError}
              </div>
            ) : previewRows.length > 0 ? (
              <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">
                {JSON.stringify(previewRows, null, 2)}
              </pre>
            ) : (
              <div className="rounded-xl bg-slate-950 p-4 text-sm text-slate-500">
                Sin preview
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}