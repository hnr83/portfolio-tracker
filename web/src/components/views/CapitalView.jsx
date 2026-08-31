import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import { formatCurrency } from "../../utils/formatters";

function MetricCard({ label, value, helper, positive }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-3 text-2xl font-semibold tabular-nums ${positive === undefined ? "text-white" : positive ? "text-emerald-400" : "text-red-400"}`}>
        {formatCurrency(value, "USD")}
      </div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

export default function CapitalView({ summary, positions }) {
  const [netContributions, setNetContributions] = useState(null);

  useEffect(() => {
    async function loadContributions() {
      try {
        const res = await apiFetch("/api/portfolio/net-contributions-history?range=MAX");
        const rows = await res.json();
        const last = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
        setNetContributions(last ? Number(last.cumulative_net_contributions_usd || 0) : null);
      } catch (error) {
        console.error("Error loading net contributions:", error);
        setNetContributions(null);
      }
    }
    loadContributions();
  }, []);

  const data = useMemo(() => {
    const costBasis = Number(summary?.investments_cost_usd || 0);
    const investments = Number(summary?.investments_market_usd || 0);
    const unrealized = Number(summary?.unrealized_pnl_usd || 0);
    const realized = Number(summary?.realized_pnl_usd || 0);
    const trading = Number(summary?.trading_retained_result_usd || 0);
    const patrimony = Number(summary?.total_with_trading_usd || 0);
    const usd = (positions || [])
      .filter((p) => ["CASH", "FX"].includes(p.category))
      .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);
    const usdt = (positions || [])
      .filter((p) => p.category === "CRYPTO")
      .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);
    const contributions = Number(netContributions || 0);
    const reconstructed = costBasis + unrealized + usd + usdt + trading;
    const difference = patrimony - reconstructed;

    return {
      contributions, costBasis, investments, unrealized, realized, trading,
      patrimony, usd, usdt, reconstructed, difference,
      generated: patrimony - contributions,
      closes: Math.abs(difference) <= 1,
    };
  }, [summary, positions, netContributions]);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Capital</div>
          <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Cómo se construye el patrimonio</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-400 md:text-base">Origen del capital, dónde está hoy y conciliación de la foto actual.</p>
        </div>
        <div className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${data.closes ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
          {data.closes ? "Conciliación OK" : `Diferencia ${formatCurrency(data.difference, "USD")}`}
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-800/80 p-5 md:p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Origen y resultados</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetricCard label="Aportes netos" value={data.contributions} helper="Entradas externas − salidas externas" />
          <MetricCard label="PnL realizado" value={data.realized} helper="Ganancia realizada FIFO acumulada" positive={data.realized >= 0} />
          <MetricCard label="Resultado Trading" value={data.trading} helper="Resultado retenido en Trading" positive={data.trading >= 0} />
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-800/80 p-5 md:p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Dónde está hoy</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Cost basis Investments" value={data.costBasis} helper="Costo de posiciones abiertas" />
          <MetricCard label="PnL no realizado" value={data.unrealized} helper="Mismo PnL live que Portfolio" positive={data.unrealized >= 0} />
          <MetricCard label="USD" value={data.usd} helper="Liquidez USD actual" />
          <MetricCard label="USDT" value={data.usdt} helper="Liquidez crypto actual" />
        </div>
      </section>

      <section className="rounded-[24px] border border-indigo-500/20 bg-indigo-500/[0.04] p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/70">Patrimonio actual</div>
            <div className="mt-2 text-3xl font-semibold text-white tabular-nums">{formatCurrency(data.patrimony, "USD")}</div>
            <div className="mt-1 text-xs text-slate-400">Investments + USD + USDT + Trading</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/70">Exceso sobre aportes</div>
            <div className="mt-2 text-3xl font-semibold text-white tabular-nums">{formatCurrency(data.generated, "USD")}</div>
            <div className="mt-1 text-xs text-slate-400">Patrimonio − aportes netos</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/70">Prueba patrimonial</div>
            <div className="mt-2 text-lg font-semibold text-white tabular-nums">{formatCurrency(data.reconstructed, "USD")}</div>
            <div className="mt-1 text-xs text-slate-400">Cost basis + PnL no realizado + USD + USDT + Trading</div>
            <div className="mt-2 text-xs text-slate-500">PnL realizado se muestra como resultado histórico y no se suma otra vez.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
