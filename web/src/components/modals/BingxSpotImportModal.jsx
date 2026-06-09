import { useState } from "react";
import { apiFetch } from "../../utils/api";
import { formatCurrency, formatNumber } from "../../utils/formatters";

export default function BingxSpotImportModal({ isOpen, onClose, onImported }) {
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [lookbackDays, setLookbackDays] = useState("");
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  const rows = preview?.rowsToInsert || [];

  function buildQuery() {
    const query = new URLSearchParams();

    if (symbol) query.set("symbol", symbol);
    if (lookbackDays) query.set("lookbackDays", lookbackDays);

    return query.toString();
  }

  async function handlePreview() {
    try {
      setLoadingPreview(true);
      setError("");
      setMessage("");

      const response = await apiFetch(
        `/api/portfolio/bingx-spot/sync-preview?${buildQuery()}`
      );

      if (!response.ok) {
        throw new Error(`Preview HTTP ${response.status}`);
      }

      const data = await response.json();
      setPreview(data);
    } catch (err) {
      console.error(err);
      setError("No se pudo generar el preview de BingX Spot.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirm() {
    try {
      setConfirming(true);
      setError("");
      setMessage("");

      const response = await apiFetch(
        `/api/portfolio/bingx-spot/sync-confirm?${buildQuery()}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Confirm HTTP ${response.status}`);
      }

      const data = await response.json();

      setPreview(data.preview || null);
      setMessage(
        data.inserted > 0
          ? `Importación exitosa: ${data.importedOrders} operación/es y ${data.inserted} movimientos.`
          : data.message || "No hay operaciones nuevas para importar."
      );

      if (onImported) {
        await onImported();
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo confirmar la importación.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-x-3 bottom-3 top-6 z-[90] mx-auto flex max-w-4xl flex-col rounded-[28px] border border-slate-700/80 bg-[#020617] shadow-[0_30px_100px_rgba(0,0,0,0.75)] sm:inset-x-6 sm:bottom-6 sm:top-10">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
              BingX Spot
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Importar compras spot
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Trae compras recurrentes, manuales y limits ejecutadas. Cada swap genera 2 movimientos.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>

        <div className="grid gap-3 border-b border-slate-800 px-5 py-4 sm:grid-cols-[1fr_120px_auto_auto]">
          <select
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setPreview(null);
              setMessage("");
            }}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white"
          >
            <option value="BTC-USDT">BTC-USDT</option>
            <option value="ETH-USDT">ETH-USDT</option>
          </select>

          <input
            value={lookbackDays}
            onChange={(e) => {
              setLookbackDays(e.target.value);
              setPreview(null);
              setMessage("");
            }}
            type="number"
            min="1"
            placeholder="Hoy"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white placeholder:text-slate-500"
          />

          <button
            type="button"
            onClick={handlePreview}
            disabled={loadingPreview}
            className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-3 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            {loadingPreview ? "Buscando..." : "Preview"}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming || !rows.length}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {confirming ? "Importando..." : "Confirmar"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {message}
            </div>
          )}

          {!preview && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
              Presioná <span className="text-white">Preview</span> para buscar operaciones spot nuevas.
            </div>
          )}

          {preview && (
            <>
              <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-slate-900 px-3 py-1">
                  Modo: {preview.mode === "TODAY" ? "Hoy" : `${preview.lookbackDays} días`}
                </span>
                <span className="rounded-full bg-slate-900 px-3 py-1">
                  Fills: {preview.totalFills}
                </span>
                <span className="rounded-full bg-slate-900 px-3 py-1">
                  Operaciones: {preview.groupedOrders}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                  Nuevas: {preview.newOrders}
                </span>
                <span className="rounded-full bg-slate-900 px-3 py-1">
                  Ya importadas: {preview.alreadyExists}
                </span>
              </div>

              {!rows.length ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
                  No hay operaciones nuevas para importar.
                </div>
              ) : (
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div
                      key={row.externalId}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-white">
                            {row.friendlyText}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.date} · {row.symbol} · {row.type}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-base font-semibold text-emerald-300">
                            {formatCurrency(row.amountUsd, "USD")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Precio {formatCurrency(row.priceUsd, "USD")}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
                        <div>
                          <span className="block text-slate-500">Cantidad neta</span>
                          <span className="text-white">
                            {formatNumber(row.quantity, 8)} {row.asset}
                          </span>
                        </div>

                        <div>
                          <span className="block text-slate-500">Cantidad bruta</span>
                          <span className="text-white">
                            {formatNumber(row.grossQuantity, 8)} {row.asset}
                          </span>
                        </div>

                        <div>
                          <span className="block text-slate-500">Comisión</span>
                          <span className="text-white">
                            {formatNumber(row.commissionQuantity, 8)} {row.commissionAsset}
                          </span>
                        </div>

                        <div>
                          <span className="block text-slate-500">Movimientos</span>
                          <span className="text-white">2</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}