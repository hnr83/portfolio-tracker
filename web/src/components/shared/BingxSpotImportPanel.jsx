import { useState } from "react";
import { apiFetch } from "../../utils/api";
import { formatCurrency, formatNumber } from "../../utils/formatters";

export default function BingxSpotImportPanel({ onImported }) {
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [lookbackDays, setLookbackDays] = useState("");
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const query = new URLSearchParams();

  if (symbol) query.set("symbol", symbol);
  if (lookbackDays) query.set("lookbackDays", lookbackDays);

  async function handlePreview() {
    try {
      setLoadingPreview(true);
      setError("");
      setMessage("");

      const response = await apiFetch(
        `/api/portfolio/bingx-spot/sync-preview?${query.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Preview HTTP ${response.status}`);
      }

      const data = await response.json();
      setPreview(data);
    } catch (err) {
      console.error(err);
      setError("No se pudo generar el preview de BingX Spot");
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
        `/api/portfolio/bingx-spot/sync-confirm?${query.toString()}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Confirm HTTP ${response.status}`);
      }

      const data = await response.json();

      setMessage(
        data.inserted > 0
          ? `Importación exitosa: ${data.importedOrders} operación/es, ${data.inserted} movimientos.`
          : data.message || "No hay operaciones nuevas para importar."
      );

      setPreview(data.preview || null);

      if (onImported) {
        await onImported();
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo confirmar la importación de BingX Spot");
    } finally {
      setConfirming(false);
    }
  }

  const rows = preview?.rowsToInsert || [];

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            BingX Spot
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Importar compras spot
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Trae compras recurrentes, manuales y limits ejecutadas. Cada swap genera 2 movimientos.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="BTC-USDT">BTC-USDT</option>
            <option value="ETH-USDT">ETH-USDT</option>
          </select>

          <input
            value={lookbackDays}
            onChange={(e) => setLookbackDays(e.target.value)}
            placeholder="Hoy"
            type="number"
            min="1"
            className="w-24 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />

          <button
            type="button"
            onClick={handlePreview}
            disabled={loadingPreview}
            className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            {loadingPreview ? "Buscando..." : "Preview"}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming || !rows.length}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {confirming ? "Importando..." : "Confirmar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {message}
        </div>
      )}

      {preview && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full bg-slate-900 px-3 py-1">
              Modo: {preview.mode === "TODAY" ? "Hoy" : `${preview.lookbackDays} días`}
            </span>
            <span className="rounded-full bg-slate-900 px-3 py-1">
              Nuevas: {preview.newOrders}
            </span>
            <span className="rounded-full bg-slate-900 px-3 py-1">
              Ya importadas: {preview.alreadyExists}
            </span>
          </div>

          {!rows.length ? (
            <p className="text-sm text-slate-400">
              No hay operaciones nuevas para importar.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.externalId}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {row.friendlyText}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.date} · {row.symbol} · {row.type}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-300">
                        {formatCurrency(row.amountUsd, "USD")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCurrency(row.priceUsd, "USD")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
                    <div>
                      <span className="block text-slate-500">Cantidad neta</span>
                      <span className="text-white">
                        {formatNumber(row.quantity)} {row.asset}
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-500">Cantidad bruta</span>
                      <span className="text-white">
                        {formatNumber(row.grossQuantity)} {row.asset}
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-500">Comisión</span>
                      <span className="text-white">
                        {formatNumber(row.commissionQuantity)} {row.commissionAsset}
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
        </div>
      )}
    </div>
  );
}