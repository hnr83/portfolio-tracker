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
  const [historicalTradingPnl, setHistoricalTradingPnl] = useState(null);

  useEffect(() => {
    async function loadHistoricalData() {
      try {
        const [contributionsRes, tradingRes] = await Promise.all([
          apiFetch("/api/portfolio/net-contributions-history?range=MAX"),
          apiFetch("/api/trading/by-asset"),
        ]);

        if (!contributionsRes.ok || !tradingRes.ok) {
          throw new Error("No se pudo cargar el histórico de capital");
        }

        const [contributionRows, tradingRows] = await Promise.all([
          contributionsRes.json(),
          tradingRes.json(),
        ]);

        const last = Array.isArray(contributionRows) && contributionRows.length
          ? contributionRows[contributionRows.length - 1]
          : null;

        setNetContributions(
          last ? Number(last.cumulative_net_contributions_usd || 0) : null
        );

        const tradingPnl = Array.isArray(tradingRows)
          ? tradingRows.reduce((acc, row) => acc + Number(row.pnl_usd || 0), 0)
          : null;

        setHistoricalTradingPnl(tradingPnl);
      } catch (error) {
        console.error("Error loading capital history:", error);
        setNetContributions(null);
        setHistoricalTradingPnl(null);
      }
    }

    loadHistoricalData();
  }, []);

  const data = useMemo(() => {
    const costBasis = Number(summary?.investments_cost_usd || 0);
    const investments = Number(summary?.investments_market_usd || 0);
    const unrealized = Number(summary?.unrealized_pnl_usd || 0);
    const realized = Number(summary?.realized_pnl_usd || 0);
    const trading = Number(summary?.trading_retained_result_usd || 0);
    const tradingPnl = Number(historicalTradingPnl || 0);
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
    const generated = patrimony - contributions;
    const generatedPct = contributions !== 0 ? generated / contributions : 0;

    return {
      contributions,
      costBasis,
      investments,
      unrealized,
      realized,
      trading,
      tradingPnl,
      patrimony,
      usd,
      usdt,
      reconstructed,
      difference,
      generated,
      generatedPct,
      closes: Math.abs(difference) <= 1,
    };
  }, [summary, positions, netContributions, historicalTradingPnl]);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Capital</div>
          <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Cómo se construye el patrimonio</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-400 md:text-base">Origen del capital, resultados realizados y composición de la foto actual.</p>
        </div>
        <div className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${data.closes ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
          {data.closes ? "Conciliación OK" : `Diferencia ${formatCurrency(data.difference, "USD")}`}
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-800/80 p-5 md:p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Origen y resultados históricos</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetricCard label="Aportes netos" value={data.contributions} helper="Capital externo neto aportado · incluye lo invertido y lo que hoy permanece en USD/USDT" />
          <MetricCard label="PnL realizado Investments" value={data.realized} helper="Ganancia realizada FIFO acumulada · no se suma otra vez al patrimonio actual" positive={data.realized >= 0} />
          <MetricCard label="PnL histórico Trading" value={data.tradingPnl} helper="Resultado acumulado de trades cerrados · distinto del saldo que hoy permanece en Trading" positive={data.tradingPnl >= 0} />
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-800/80 p-5 md:p-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Dónde está hoy</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Cost basis Investments" value={data.costBasis} helper="Costo de posiciones abiertas" />
          <MetricCard label="PnL no realizado" value={data.unrealized} helper="Mismo PnL live que Portfolio" positive={data.unrealized >= 0} />
          <MetricCard label="USD" value={data.usd} helper="Liquidez USD actual" />
          <MetricCard label="USDT" value={data.usdt} helper="Liquidez crypto actual" />
          <MetricCard label="Trading retenido" value={data.trading} helper="Valor actual que permanece dentro de Trading" positive={data.trading >= 0} />
        </div>
      </section>

      <section className="rounded-[24px] border border-indigo-500/20 bg-indigo-500/[0.04] p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/70">Patrimonio actual</div>
            <div className="mt-2 text-3xl font-semibold text-white tabular-nums">{formatCurrency(data.patrimony, "USD")}</div>
            <div className="mt-1 text-xs text-slate-400">Investments + USD + USDT + Trading retenido</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/70">Patrimonio sobre aportes</div>
            <div className="mt-2 text-3xl font-semibold text-white tabular-nums">{formatCurrency(data.generated, "USD")}</div>
            <div className={`mt-1 text-sm font-semibold tabular-nums ${data.generatedPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {data.generatedPct >= 0 ? "+" : ""}{new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(data.generatedPct)} sobre capital neto aportado
            </div>
            <div className="mt-1 text-xs text-slate-400">Patrimonio actual − aportes netos · no equivale directamente a rentabilidad</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/70">Prueba patrimonial</div>
            <div className="mt-2 text-lg font-semibold text-white tabular-nums">{formatCurrency(data.reconstructed, "USD")}</div>
            <div className="mt-1 text-xs text-slate-400">Cost basis + PnL no realizado + USD + USDT + Trading retenido</div>
            <div className="mt-2 text-xs text-slate-500">Los resultados realizados se muestran como explicación histórica y no se suman otra vez.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
