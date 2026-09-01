import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AssetAvatar from "../shared/AssetAvatar";
import { apiFetch } from "../../utils/api";
import { formatCurrency, formatNumber, formatPortfolioPercent } from "../../utils/formatters";

const RANGES = ["30D", "YTD", "1Y", "MAX"];

function dateForRange(range) {
  const date = new Date();
  if (range === "30D") date.setUTCDate(date.getUTCDate() - 30);
  else if (range === "YTD") date.setUTCMonth(0, 1);
  else if (range === "1Y") date.setUTCFullYear(date.getUTCFullYear() - 1);
  else return null;
  return date.toISOString().slice(0, 10);
}

function Metric({ label, value, detail, positive }) {
  const color = positive == null ? "text-white" : positive ? "text-emerald-400" : "text-red-400";
  return <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
    <div className={`mt-2 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    {detail && <div className="mt-1 text-xs text-slate-400">{detail}</div>}
  </div>;
}

export default function AssetDetailView({ selectedAsset, onBack, onTransactions }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("1Y");
  const [chartMetric, setChartMetric] = useState("market_value_usd");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true); setError("");
        const ticker = selectedAsset?.ticker || selectedAsset?.normalized_ticker;
        const response = await apiFetch(`/api/portfolio/assets/${encodeURIComponent(ticker)}/detail`);
        if (!response.ok) throw new Error(`No se pudo cargar el activo (${response.status})`);
        const payload = await response.json();
        if (!cancelled) setData(payload);
      } catch (err) { if (!cancelled) setError(err.message || "No se pudo cargar el activo"); }
      finally { if (!cancelled) setLoading(false); }
    }
    if (selectedAsset) load();
    return () => { cancelled = true; };
  }, [selectedAsset]);

  const rows = useMemo(() => {
    const start = dateForRange(range);
    return (data?.series || []).filter((row) => !start || row.date >= start);
  }, [data, range]);
  const asset = data?.asset;
  const displayTicker = asset?.normalized_ticker || asset?.ticker || selectedAsset?.ticker;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const quantityDelta = first && last ? last.quantity - first.quantity : 0;
  const quantityDeltaPct = first?.quantity ? quantityDelta / first.quantity * 100 : null;

  if (loading) return <div className="rounded-[22px] border border-slate-800 bg-slate-950/70 p-8 text-slate-300">Cargando evolución del activo...</div>;
  if (error || !asset) return <div className="space-y-4"><button onClick={onBack} className="text-sm text-slate-400 hover:text-white">← Volver</button><div className="rounded-2xl border border-red-900 bg-red-950/40 p-5 text-red-300">{error || "Activo no encontrado"}</div></div>;

  return <div className="space-y-4 sm:space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <button onClick={onBack} className="mb-3 text-sm text-slate-400 transition hover:text-white">← Volver</button>
        <div className="flex items-center gap-3">
          <AssetAvatar ticker={asset.ticker} normalizedTicker={asset.normalized_ticker} size={46} />
          <div><h1 className="text-2xl font-semibold text-white">{displayTicker}</h1><div className="text-sm text-slate-400">Tu posición · {asset.category}</div></div>
        </div>
      </div>
      <button onClick={() => onTransactions(asset)} className="rounded-2xl border border-slate-700 px-5 py-3 text-sm text-white transition hover:bg-slate-800/60">Ver transacciones</button>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Valor actual" value={formatCurrency(asset.market_value_usd, "USD")} detail={`${formatNumber(asset.quantity_net, 6)} ${displayTicker}`} />
      <Metric label="Peso en cartera" value={formatPortfolioPercent(data.summary.current_weight_pct)} detail="Sobre el portfolio total" />
      <Metric label="PnL acumulado" value={formatCurrency(asset.pnl_usd, "USD")} detail={formatPortfolioPercent(Number(asset.pnl_pct || 0) * 100)} positive={Number(asset.pnl_usd) >= 0} />
      <Metric label={`Acumulación ${range}`} value={`${quantityDelta >= 0 ? "+" : ""}${formatNumber(quantityDelta, 6)}`} detail={quantityDeltaPct == null ? "Sin base comparable" : `${quantityDeltaPct >= 0 ? "+" : ""}${formatPortfolioPercent(quantityDeltaPct)} nominal`} positive={quantityDelta >= 0} />
    </div>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {(data.periods || []).map((item) => <div key={item.period} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
        <div className="text-xs font-medium text-slate-400">{item.period}</div>
        <div className={`mt-2 text-base font-semibold tabular-nums ${Number(item.pnl_usd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{item.pnl_usd == null ? "-" : formatCurrency(item.pnl_usd, "USD")}</div>
        <div className={`mt-1 text-xs tabular-nums ${Number(item.pnl_pct) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{item.pnl_pct == null ? "-" : `${item.pnl_pct >= 0 ? "+" : ""}${formatPortfolioPercent(item.pnl_pct)}`}</div>
      </div>)}
    </div>

    <div className="rounded-[22px] border border-slate-800/80 bg-slate-950/70 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold text-white">Evolución en tu cartera</h2><p className="mt-1 text-xs text-slate-400">Valor, unidades acumuladas y peso histórico{data.summary.price_history_start_date ? ` · Precios disponibles desde ${data.summary.price_history_start_date}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {[{ key: "market_value_usd", label: "Valor" }, { key: "quantity", label: "Cantidad" }, { key: "portfolio_weight_pct", label: "Peso" }].map((item) => <button key={item.key} onClick={() => setChartMetric(item.key)} className={`rounded-xl px-3 py-2 text-xs ${chartMetric === item.key ? "bg-indigo-500 text-white" : "bg-slate-900 text-slate-400"}`}>{item.label}</button>)}
          {RANGES.map((item) => <button key={item} onClick={() => setRange(item)} className={`rounded-xl px-3 py-2 text-xs ${range === item ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}>{item}</button>)}
        </div>
      </div>
      <div className="mt-5 h-[310px] w-full">
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="assetFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5B7CFA" stopOpacity={0.35}/><stop offset="100%" stopColor="#5B7CFA" stopOpacity={0.02}/></linearGradient></defs>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28}/><YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => chartMetric === "market_value_usd" ? `$${Math.round(v / 1000)}k` : chartMetric === "portfolio_weight_pct" ? `${Number(v).toFixed(1)}%` : formatNumber(v, 3)}/>
          <Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", borderRadius: 14 }} formatter={(v) => [chartMetric === "market_value_usd" ? formatCurrency(v, "USD") : chartMetric === "portfolio_weight_pct" ? formatPortfolioPercent(v) : formatNumber(v, 6), chartMetric === "market_value_usd" ? "Valor en cartera" : chartMetric === "portfolio_weight_pct" ? "Peso en cartera" : "Cantidad"]}/>
          <Area type="monotone" dataKey={chartMetric} stroke="#6d8cff" strokeWidth={2.5} fill="url(#assetFill)" connectNulls />
        </AreaChart></ResponsiveContainer>
      </div>
    </div>

    <div className="rounded-[22px] border border-slate-800/80 bg-slate-950/70 p-5">
      <h2 className="text-lg font-semibold text-white">Detalle de tu posición</h2>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="text-slate-500">Precio actual</span><div className="mt-1 text-white">{formatCurrency(asset.market_price, asset.price_currency || "USD")}</div></div>
        <div><span className="text-slate-500">Costo total</span><div className="mt-1 text-white">{formatCurrency(asset.cost_value_usd, "USD")}</div></div>
        <div><span className="text-slate-500">Primera posición</span><div className="mt-1 text-white">{data.summary.first_position_date || "-"}</div></div>
        <button onClick={() => onTransactions(asset)} className="text-left"><span className="text-slate-500">Operaciones</span><div className="mt-1 font-medium text-indigo-400">Ver transacciones →</div></button>
      </div>
    </div>
  </div>;
}
