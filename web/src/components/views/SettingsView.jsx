import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../../utils/api";

const OPERATION_LABELS = {
  baseline: "Uso previo",
  decision: "Investment Twin",
  interview: "Perfil del inversor",
  trading: "Análisis de trading",
  market: "Análisis de mercado",
  internal: "Consulta interna",
};

function monthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthOptions(count = 12) {
  const formatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    return { value: monthValue(date), label: formatter.format(date) };
  });
}

function compact(value) {
  return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function usd(value, digits = 4) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: digits }).format(Number(value) || 0);
}

function percent(value) {
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function operationLabel(value) {
  return OPERATION_LABELS[value] || String(value || "Otro").replaceAll("_", " ");
}

function StatCard({ label, value, detail, accent = false }) {
  return <article className={`rounded-[22px] border p-5 ${accent ? "border-indigo-400/20 bg-gradient-to-br from-indigo-500/[.14] to-sky-500/[.04]" : "border-slate-700/50 bg-slate-900/45"}`}>
    <div className="text-[10px] uppercase tracking-[.16em] text-slate-500">{label}</div>
    <div className="mt-3 text-2xl font-semibold tracking-[-.03em] text-white">{value}</div>
    <div className="mt-2 text-[11px] text-slate-500">{detail}</div>
  </article>;
}

function BreakdownRow({ label, value, max, detail }) {
  const width = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return <div>
    <div className="flex items-center justify-between gap-4 text-xs"><span className="truncate text-slate-300">{label}</span><span className="shrink-0 tabular-nums text-slate-200">{detail}</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400" style={{ width: `${width}%` }} /></div>
  </div>;
}

function UsageTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};
  return <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] shadow-xl">
    <div className="text-slate-400">{label}</div>
    <div className="mt-1 text-white">{usd(item.costUsd)} · {compact(item.totalTokens)} tokens</div>
  </div>;
}

export default function SettingsView() {
  const [scope, setScope] = useState("month");
  const [period, setPeriod] = useState(monthValue());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const periods = useMemo(() => monthOptions(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = scope === "month" ? `period=${encodeURIComponent(period)}` : `range=${scope}`;
      const response = await apiFetch(`/api/digital-twin/usage?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar el uso de IA");
      setData(body);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const tokenMax = Math.max(summary.inputTokens || 0, summary.cachedTokens || 0, summary.outputTokens || 0, 1);
  const modelMax = Math.max(...(data?.byModel || []).map((item) => item.costUsd), 1);
  const operationMax = Math.max(...(data?.byOperation || []).map((item) => item.costUsd), 1);

  return <section className="min-h-[calc(100vh-2rem)] text-slate-200">
    <header className="flex flex-col gap-4 border-b border-slate-800/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="text-[10px] uppercase tracking-[.2em] text-indigo-300">Configuración</div><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white">Settings</h1><p className="mt-2 text-sm text-slate-500">Controlá cómo funciona y cuánto cuesta la inteligencia de tu portfolio.</p></div>
      <div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border border-slate-700 bg-slate-900/80 p-1">{["7d", "14d", "30d", "month"].map((value) => <button key={value} type="button" onClick={() => setScope(value)} className={`rounded-lg px-3 py-2 text-[11px] transition ${scope === value ? "bg-indigo-500/20 text-indigo-200" : "text-slate-500 hover:text-slate-300"}`}>{value === "month" ? "Mes" : value}</button>)}</div>{scope === "month" && <select value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs capitalize text-slate-200 outline-none focus:border-indigo-500">{periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</div>
    </header>

    <div className="mt-7">
      <main className="min-w-0">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold tracking-[-.02em] text-white">AI Usage</h2><p className="mt-1 text-xs text-slate-500">Consumo registrado por el Digital Investment Twin.</p></div><button type="button" onClick={load} disabled={loading} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-50">↻ Actualizar</button></div>

        {error && <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[.06] p-4 text-xs text-amber-300">{error}</div>}
        {loading && !data ? <div className="mt-16 text-center text-sm text-slate-500">Cargando uso de IA…</div> : <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Costo del período" value={usd(summary.costUsd, 2)} detail={summary.unpricedConversations ? `${summary.unpricedConversations} consultas aún sin precio` : `${usd(summary.reportedCostUsd)} reportado · ${usd(summary.estimatedCostUsd)} estimado`} accent />
            <StatCard label="Consultas" value={compact(summary.conversations)} detail={`${compact(summary.apiRequests)} llamadas a modelos`} />
            <StatCard label="Tokens" value={compact(summary.totalTokens)} detail={`${compact(summary.cachedTokens)} desde caché`} />
            <StatCard label="Costo promedio" value={summary.averageCostUsd == null ? "—" : usd(summary.averageCostUsd)} detail={`Sobre ${summary.pricedConversations || 0} consultas valuadas`} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
            <article className="rounded-[22px] border border-slate-800 bg-slate-950/35 p-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-medium text-white">Costo diario</h3><p className="mt-1 text-[11px] text-slate-600">Evolución dentro del mes seleccionado</p></div><span className="text-[10px] text-slate-600">USD</span></div><div className="mt-5 h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.daily || []}><defs><linearGradient id="usageCost" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity={0.35}/><stop offset="100%" stopColor="#818cf8" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(value) => value.slice(8)} axisLine={false} tickLine={false}/><YAxis hide domain={[0, "auto"]}/><Tooltip content={<UsageTooltip />}/><Area type="monotone" dataKey="costUsd" stroke="#818cf8" strokeWidth={2} fill="url(#usageCost)" /></AreaChart></ResponsiveContainer></div></article>
            <article className="rounded-[22px] border border-slate-800 bg-slate-950/35 p-5"><h3 className="text-sm font-medium text-white">Composición de tokens</h3><p className="mt-1 text-[11px] text-slate-600">Qué parte del contexto consume el modelo</p><div className="mt-6 space-y-5"><BreakdownRow label="Input" value={summary.inputTokens || 0} max={tokenMax} detail={compact(summary.inputTokens)} /><BreakdownRow label="Cached input" value={summary.cachedTokens || 0} max={tokenMax} detail={compact(summary.cachedTokens)} /><BreakdownRow label="Output" value={summary.outputTokens || 0} max={tokenMax} detail={compact(summary.outputTokens)} /></div><div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/45 px-3 py-2.5 text-[11px] text-slate-500">Tasa de caché: <span className="text-slate-200">{summary.inputTokens ? percent(summary.cachedTokens / summary.inputTokens) : "—"}</span></div></article>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-[22px] border border-slate-800 bg-slate-950/35 p-5"><h3 className="text-sm font-medium text-white">Por modelo</h3><div className="mt-5 space-y-5">{data?.byModel?.length ? data.byModel.map((item) => <BreakdownRow key={item.model} label={item.model} value={item.costUsd} max={modelMax} detail={`${usd(item.costUsd)} · ${compact(item.totalTokens)}`} />) : <div className="text-xs text-slate-600">Sin actividad en este período.</div>}</div></article>
            <article className="rounded-[22px] border border-slate-800 bg-slate-950/35 p-5"><h3 className="text-sm font-medium text-white">Por función</h3><div className="mt-5 space-y-5">{data?.byOperation?.length ? data.byOperation.map((item) => <BreakdownRow key={item.operationType} label={operationLabel(item.operationType)} value={item.costUsd} max={operationMax} detail={`${usd(item.costUsd)} · ${item.conversations}`} />) : <div className="text-xs text-slate-600">Sin actividad en este período.</div>}</div></article>
          </div>

          <article className="mt-4 overflow-hidden rounded-[22px] border border-slate-800 bg-slate-950/35"><div className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><h3 className="text-sm font-medium text-white">Actividad reciente</h3><p className="mt-1 text-[11px] text-slate-600">Últimas 20 consultas registradas</p></div>{summary.webSearchCalls > 0 && <span className="rounded-full border border-sky-400/15 bg-sky-500/[.06] px-2.5 py-1 text-[10px] text-sky-300">{summary.webSearchCalls} búsquedas web</span>}</div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-[9px] uppercase tracking-[.12em] text-slate-600"><tr><th className="px-5 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Función</th><th className="px-3 py-3 font-medium">Modelo</th><th className="px-3 py-3 text-right font-medium">Tokens</th><th className="px-5 py-3 text-right font-medium">Costo</th></tr></thead><tbody className="divide-y divide-slate-800/70">{data?.recent?.map((item) => <tr key={item.id} className="text-slate-400"><td className="whitespace-nowrap px-5 py-3">{dateTime(item.createdAt)}</td><td className="px-3 py-3 text-slate-300">{operationLabel(item.operationType)}</td><td className="px-3 py-3">{item.model}</td><td className="px-3 py-3 text-right tabular-nums">{compact(item.totalTokens)}</td><td className="px-5 py-3 text-right tabular-nums text-slate-200"><div>{item.costUsd == null ? "Sin precio" : usd(item.costUsd)}</div><div className={`mt-0.5 text-[9px] uppercase tracking-[.08em] ${item.costKind === "reported" ? "text-emerald-400" : item.costKind === "estimated" ? "text-indigo-400" : "text-amber-400"}`}>{item.costKind === "reported" ? "reportado" : item.costKind === "estimated" ? "estimado" : "sin valuar"}</div></td></tr>)}</tbody></table>{!data?.recent?.length && <div className="py-10 text-center text-xs text-slate-600">Sin actividad en este período.</div>}</div></article>

          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-800 bg-slate-950/25 p-4"><div className="text-[10px] uppercase tracking-[.12em] text-slate-600">Resueltas sin LLM</div><div className="mt-2 text-lg font-medium text-white">{summary.internalResolutionRate == null ? "—" : percent(summary.internalResolutionRate)}</div><p className="mt-1 text-[11px] leading-5 text-slate-600">Se completará cuando activemos el router de consultas internas.</p></div><div className="rounded-2xl border border-slate-800 bg-slate-950/25 p-4"><div className="text-[10px] uppercase tracking-[.12em] text-slate-600">Conciliación</div><div className="mt-2 text-lg font-medium text-white">{summary.unpricedConversations ? "Parcial" : "Uso valuado"}</div><p className="mt-1 text-[11px] leading-5 text-slate-600">La vista incluye estimaciones por tokens. OpenAI puede incluir otras API keys o funciones del mismo proyecto.</p></div></div>
        </>}
      </main>
    </div>
  </section>;
}
