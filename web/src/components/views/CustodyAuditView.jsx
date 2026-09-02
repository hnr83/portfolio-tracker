import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import { usePortfolioData } from "../../context/PortfolioDataContext";

const EMPTY_TRANSFER = {
  transfer_date: new Date().toISOString().slice(0, 10),
  ticker: "",
  owner: "Horacio",
  from_broker: "",
  to_broker: "",
  quantity: "",
  description: "",
};

const PLATFORMS = ["Sin plataforma", "BMB", "BMB Vale", "Binance", "BingX", "Cocos", "Cocos Vale", "eToro", "IBKR", "Ledger", "Ledger 2", "Ledger Flex"];

function StatusBadge({ status }) {
  const config = status === "OK"
    ? ["Conciliado", "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"]
    : status === "NEGATIVE_BALANCE"
      ? ["Saldo negativo", "border-red-500/20 bg-red-500/10 text-red-300"]
      : status === "MISSING_PLATFORM"
        ? ["Sin plataforma", "border-amber-500/20 bg-amber-500/10 text-amber-300"]
        : ["Revisar", "border-amber-500/20 bg-amber-500/10 text-amber-300"];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${config[1]}`}>{config[0]}</span>;
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.details || `HTTP ${response.status}`);
  return body;
}

export default function CustodyAuditView() {
  const { fetchCached, invalidateCache } = usePortfolioData();
  const [data, setData] = useState({ rows: [], assets: [], transfers: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyReview, setOnlyReview] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TRANSFER);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [correction, setCorrection] = useState(null);
  const [correctionValue, setCorrectionValue] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await fetchCached("custody:audit", async () => readJson(await apiFetch("/api/portfolio/custody-audit", { cache: "no-store" })), { ttlMs: 0, force: true });
      setData(result);
    } catch (err) {
      setError(err.message || "No se pudo cargar la auditoría de custodia.");
    } finally {
      setLoading(false);
    }
  }, [fetchCached]);

  useEffect(() => { load(); }, [load]);

  const searchMatchedRows = useMemo(() => (data.rows || []).filter((row) => {
    const term = search.trim().toLowerCase();
    const matches = !term || [row.ticker, row.owner, row.platform].some((value) => String(value || "").toLowerCase().includes(term));
    return matches;
  }), [data.rows, search]);

  const rows = useMemo(() => searchMatchedRows.filter((row) => !onlyReview || row.status !== "OK"), [searchMatchedRows, onlyReview]);

  const filteredSummary = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !searchMatchedRows.length) return null;

    const exactOwnerMatch = searchMatchedRows.some((row) => String(row.owner || "").toLowerCase() === term);
    const tickers = [...new Set(searchMatchedRows.map((row) => row.ticker).filter(Boolean))];

    if (!exactOwnerMatch && tickers.length === 1) {
      const ticker = tickers[0];
      const assetRows = (data.rows || []).filter((row) => row.ticker === ticker);
      const expected = Number(assetRows[0]?.expected_quantity || 0);
      const positive = assetRows.reduce((sum, row) => sum + Math.max(Number(row.quantity || 0), 0), 0);
      const negative = assetRows.reduce((sum, row) => sum + Math.min(Number(row.quantity || 0), 0), 0);
      const net = positive + negative;
      return { type: "asset", ticker, expected, positive, negative, net, difference: expected - net };
    }

    return {
      type: "group",
      marketValue: searchMatchedRows.reduce((sum, row) => sum + Number(row.market_value_usd || 0), 0),
      assets: tickers.length,
      platforms: new Set(searchMatchedRows.map((row) => row.platform).filter(Boolean)).size,
      positions: searchMatchedRows.length,
    };
  }, [data.rows, search, searchMatchedRows]);

  function openTransfer(row = null) {
    setForm({ ...EMPTY_TRANSFER, ticker: row?.ticker || "", owner: row?.owner === "Sin titular" ? "" : row?.owner || "Horacio", from_broker: row?.platform || "", quantity: row?.quantity > 0 ? String(row.quantity) : "" });
    setFormError("");
    setModalOpen(true);
  }

  async function saveTransfer(event) {
    event.preventDefault();
    try {
      setSaving(true); setFormError("");
      await readJson(await apiFetch("/api/portfolio/custody-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }));
      invalidateCache("custody:");
      setModalOpen(false);
      await load();
    } catch (err) { setFormError(err.message || "No se pudo guardar la transferencia."); }
    finally { setSaving(false); }
  }

  async function removeTransfer(id) {
    if (!window.confirm("¿Eliminar esta transferencia de custodia?")) return;
    try {
      await readJson(await apiFetch(`/api/portfolio/custody-transfers/${id}`, { method: "DELETE" }));
      invalidateCache("custody:");
      await load();
    } catch (err) { setError(err.message || "No se pudo eliminar la transferencia."); }
  }

  function openCorrection(type, row) {
    setCorrection({ type, row });
    setCorrectionValue(type === "owner" ? (row.owner === "Sin titular" ? "" : row.owner) : row.platform);
    setFormError("");
  }

  async function saveCorrection(event) {
    event.preventDefault();
    try {
      setSaving(true); setFormError("");
      const isOwner = correction.type === "owner";
      const isMissingPlatform = !isOwner && correction.row.platform === "Sin plataforma";
      if (isMissingPlatform && correctionValue === "Sin plataforma") throw new Error("Elegí la plataforma donde está custodiado el saldo.");
      if (isMissingPlatform && Number(correction.row.quantity) === 0) throw new Error("No se puede asignar una plataforma a un saldo en cero.");
      const path = isOwner
        ? "/api/portfolio/custody-owner-assignments"
        : isMissingPlatform
          ? "/api/portfolio/custody-transfers"
          : "/api/portfolio/custody-broker-aliases";
      const body = isOwner
        ? { ticker: correction.row.ticker, platform: correction.row.platform, owner: correctionValue }
        : isMissingPlatform
          ? {
              transfer_date: new Date().toISOString().slice(0, 10),
              ticker: correction.row.ticker,
              owner: correction.row.owner === "Sin titular" ? "" : correction.row.owner,
              from_broker: Number(correction.row.quantity) > 0 ? "Sin plataforma" : correctionValue,
              to_broker: Number(correction.row.quantity) > 0 ? correctionValue : "Sin plataforma",
              quantity: Math.abs(Number(correction.row.quantity)),
              description: "Asignación de plataforma desde auditoría de custodia",
            }
          : { raw_broker: correction.row.platform, canonical_broker: correctionValue };
      await readJson(await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      invalidateCache("custody:");
      setCorrection(null);
      await load();
    } catch (err) { setFormError(err.message || "No se pudo guardar la corrección."); }
    finally { setSaving(false); }
  }

  async function removeRule(type, id) {
    if (!window.confirm("¿Eliminar esta regla de corrección?")) return;
    const path = type === "owner" ? `/api/portfolio/custody-owner-assignments/${id}` : `/api/portfolio/custody-broker-aliases/${id}`;
    try {
      await readJson(await apiFetch(path, { method: "DELETE" }));
      invalidateCache("custody:");
      await load();
    } catch (err) { setError(err.message || "No se pudo eliminar la corrección."); }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-indigo-300">Control de posiciones</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Auditoría de custodia</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Reconstrucción de cada activo por plataforma y titular, conciliada contra la posición global.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => load()} disabled={loading} className="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">{loading ? "Actualizando…" : "Actualizar"}</button>
          <button type="button" onClick={() => openTransfer()} className="rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white">Registrar transferencia</button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Activos", data.summary?.assets || 0, "text-white"], ["Conciliados", data.summary?.ok || 0, "text-emerald-300"], ["A revisar", data.summary?.review || 0, "text-amber-300"], ["Sin plataforma", data.summary?.missingPlatform || 0, "text-red-300"]].map(([label, value, color]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div><div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div></div>
        ))}
      </section>

      <section className="overflow-hidden rounded-[26px] border border-slate-800 bg-slate-950/35">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar activo, plataforma o titular…" className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={onlyReview} onChange={(event) => setOnlyReview(event.target.checked)} className="accent-indigo-500" /> Mostrar solo inconsistencias</label>
        </div>
        {filteredSummary?.type === "asset" && <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800 md:grid-cols-5">
          {[
            ["Esperado", filteredSummary.expected],
            ["Saldos positivos", filteredSummary.positive],
            ["Saldos negativos", filteredSummary.negative],
            ["Neto distribuido", filteredSummary.net],
            ["Diferencia", filteredSummary.difference],
          ].map(([label, value]) => <div key={label} className="bg-slate-950 px-4 py-3"><div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div><div className={`mt-1 text-sm font-medium tabular-nums ${Number(value) < 0 ? "text-red-300" : "text-slate-200"}`}>{formatNumber(value, 8)} {filteredSummary.ticker}</div></div>)}
        </div>}
        {filteredSummary?.type === "group" && <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800 lg:grid-cols-4">
          {[
            ["Valor estimado", formatCurrency(filteredSummary.marketValue, "USD")],
            ["Activos", formatNumber(filteredSummary.assets, 0)],
            ["Plataformas", formatNumber(filteredSummary.platforms, 0)],
            ["Posiciones", formatNumber(filteredSummary.positions, 0)],
          ].map(([label, value]) => <div key={label} className="bg-slate-950 px-4 py-3"><div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-1 text-sm font-medium tabular-nums text-slate-200">{value}</div></div>)}
        </div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3">Activo</th><th className="px-4 py-3">Plataforma</th><th className="px-4 py-3">Titular</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Valor estimado</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => <tr key={`${row.ticker}-${row.owner}-${row.platform}`} className="text-slate-300">
                <td className="px-4 py-3 font-semibold text-white">{row.ticker}</td><td className="px-4 py-3">{row.platform}</td><td className="px-4 py-3">{row.owner}</td><td className={`px-4 py-3 text-right tabular-nums ${Number(row.quantity) < 0 ? "text-red-300" : ""}`}>{formatNumber(row.quantity, 8)}</td><td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.market_value_usd, "USD")}</td><td className="px-4 py-3"><StatusBadge status={row.status} /></td><td className="px-4 py-3"><div className="flex justify-end gap-3"><button type="button" onClick={() => openCorrection("owner", row)} className="text-xs text-sky-300 hover:text-sky-200">Titular</button><button type="button" onClick={() => openCorrection("broker", row)} className="text-xs text-violet-300 hover:text-violet-200">Broker</button><button type="button" onClick={() => openTransfer(row)} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">Transferir</button></div></td>
              </tr>)}
              {!loading && rows.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">No hay posiciones para mostrar.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {(data.transfers || []).length > 0 && <section className="rounded-[26px] border border-slate-800 bg-slate-950/35 p-5"><h2 className="text-lg font-semibold text-white">Transferencias registradas</h2><div className="mt-4 space-y-2">{data.transfers.map((transfer) => <div key={transfer.id} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="font-semibold text-white">{transfer.ticker}</span><span className="ml-2 text-slate-400">{formatNumber(transfer.quantity, 8)} · {transfer.from_broker} → {transfer.to_broker}</span><div className="mt-1 text-xs text-slate-500">{String(transfer.transfer_date).slice(0, 10)} · {transfer.owner || "Sin titular"}{transfer.description ? ` · ${transfer.description}` : ""}</div></div><button type="button" onClick={() => removeTransfer(transfer.id)} className="self-start text-xs text-red-300 hover:text-red-200 sm:self-auto">Eliminar</button></div>)}</div></section>}

      {((data.brokerAliases || []).length > 0 || (data.ownerAssignments || []).length > 0) && <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[26px] border border-slate-800 bg-slate-950/35 p-5"><h2 className="text-lg font-semibold text-white">Alias de plataformas</h2><div className="mt-4 space-y-2">{(data.brokerAliases || []).map((rule) => <div key={rule.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"><span className="text-slate-300">{rule.raw_broker} <span className="mx-2 text-slate-600">→</span> <strong className="text-white">{rule.canonical_broker}</strong></span><button type="button" onClick={() => removeRule("broker", rule.id)} className="text-xs text-red-300">Eliminar</button></div>)}</div></div>
        <div className="rounded-[26px] border border-slate-800 bg-slate-950/35 p-5"><h2 className="text-lg font-semibold text-white">Titulares asignados</h2><div className="mt-4 space-y-2">{(data.ownerAssignments || []).map((rule) => <div key={rule.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"><span className="text-slate-300"><strong className="text-white">{rule.ticker}</strong> · {rule.platform} <span className="mx-2 text-slate-600">→</span> {rule.owner}</span><button type="button" onClick={() => removeRule("owner", rule.id)} className="text-xs text-red-300">Eliminar</button></div>)}</div></div>
      </section>}

      {modalOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"><form onSubmit={saveTransfer} className="w-full max-w-xl rounded-[28px] border border-slate-700 bg-slate-900 p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-white">Transferencia de custodia</h2><p className="mt-1 text-sm text-slate-400">No modifica costo, aportes ni PnL.</p></div><button type="button" onClick={() => setModalOpen(false)} className="text-2xl text-slate-400">×</button></div>{formError && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>}<div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-400">Fecha<input type="date" required value={form.transfer_date} onChange={(e) => setForm({ ...form, transfer_date: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
        <label className="text-sm text-slate-400">Activo<input required list="custody-assets" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /><datalist id="custody-assets">{(data.assets || []).map((asset) => <option key={asset.ticker} value={asset.ticker} />)}</datalist></label>
        <label className="text-sm text-slate-400">Titular<input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
        <label className="text-sm text-slate-400">Cantidad<input type="number" min="0" step="any" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
        <label className="text-sm text-slate-400">Desde<input required list="custody-platforms" value={form.from_broker} onChange={(e) => setForm({ ...form, from_broker: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
        <label className="text-sm text-slate-400">Hacia<input required list="custody-platforms" value={form.to_broker} onChange={(e) => setForm({ ...form, to_broker: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /><datalist id="custody-platforms">{PLATFORMS.map((platform) => <option key={platform} value={platform} />)}</datalist></label>
        <label className="text-sm text-slate-400 sm:col-span-2">Nota<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
      </div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button type="submit" disabled={saving} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar transferencia"}</button></div></form></div>}

      {correction && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"><form onSubmit={saveCorrection} className="w-full max-w-md rounded-[28px] border border-slate-700 bg-slate-900 p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-white">{correction.type === "owner" ? "Asignar titular" : correction.row.platform === "Sin plataforma" ? "Asignar plataforma" : "Normalizar plataforma"}</h2><button type="button" onClick={() => setCorrection(null)} className="text-2xl text-slate-400">×</button></div><p className="mt-2 text-sm text-slate-400">{correction.type === "owner" ? `${correction.row.ticker} · ${correction.row.platform}` : correction.row.platform === "Sin plataforma" ? `${correction.row.ticker} · ${correction.row.owner} · ${formatNumber(correction.row.quantity, 8)}` : `Reemplazar “${correction.row.platform}” en toda la auditoría`}</p>{formError && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>}<label className="mt-5 block text-sm text-slate-400">{correction.type === "owner" ? "Titular" : correction.row.platform === "Sin plataforma" ? "Plataforma" : "Nombre definitivo"}<input autoFocus required list={correction.type === "owner" ? "custody-owners" : "correction-platforms"} value={correctionValue} onChange={(event) => setCorrectionValue(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /><datalist id="custody-owners"><option value="Horacio" /><option value="Vale" /></datalist><datalist id="correction-platforms">{PLATFORMS.filter((platform) => platform !== "Sin plataforma").map((platform) => <option key={platform} value={platform} />)}</datalist></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setCorrection(null)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button type="submit" disabled={saving} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button></div></form></div>}
    </div>
  );
}
