import React, { useMemo } from "react";
import { formatCurrency, formatPercent } from "../../utils/formatters";

function pct(part, total) {
  if (!total) return 0;
  return (Number(part || 0) / Number(total || 0)) * 100;
}

export default function DigitalInvestmentTwinView({ summary, positions = [], investments = [] }) {
  const context = useMemo(() => {
    const portfolioTotal = Number(summary?.total_with_trading_usd || summary?.total_market_usd || 0);
    const crypto = positions.filter((p) => p.category === "CRYPTO").reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);
    const cash = positions.filter((p) => ["CASH", "FX"].includes(p.category)).reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);
    const usdt = positions.filter((p) => String(p.normalized_ticker || p.ticker || "").toUpperCase() === "USDT").reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);
    const investableLiquidity = cash + usdt;
    const holdings = investments
      .map((item) => ({
        ticker: item.normalized_ticker || item.ticker,
        value: Number(item.market_value_usd || 0),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    const topHoldings = holdings.slice(0, 5).map((item) => ({ ...item, weight: pct(item.value, portfolioTotal) }));
    const topWeight = topHoldings[0]?.weight || 0;

    return {
      portfolioTotal,
      crypto,
      cash,
      usdt,
      investableLiquidity,
      cryptoWeight: pct(crypto, portfolioTotal),
      liquidityWeight: pct(investableLiquidity, portfolioTotal),
      topHoldings,
      topWeight,
      positionsCount: positions.filter((p) => Number(p.market_value_usd || 0) !== 0).length,
    };
  }, [summary, positions, investments]);

  const pillars = [
    { label: "Quién soy", value: "Por aprender", detail: "Preferencias, convicciones, tolerancia y estilo de decisión. Se construirá con memoria explícita y decisiones reales." },
    { label: "Dónde estoy", value: formatCurrency(context.portfolioTotal, "USD"), detail: `${context.positionsCount} posiciones · Crypto ${formatPercent(context.cryptoWeight)} · Liquidez ${formatPercent(context.liquidityWeight)}` },
    { label: "A dónde voy", value: "Conectar Planner", detail: "La próxima iteración incorporará objetivos, horizonte, aportes y trayectoria desde Planner." },
    { label: "Cómo cambio", value: "Sin historial aún", detail: "La memoria de decisiones permitirá detectar cambios de postura, contradicciones y aprendizaje." },
  ];

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Digital Investment Twin</h1>
            <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">PoC</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Un modelo dinámico de tu forma de invertir: quién sos, dónde estás, a dónde vas y cómo está cambiando tu manera de decidir.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">
          Objetivo de costo IA: &lt; USD 10 / mes
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((pillar) => (
          <article key={pillar.label} className="rounded-[22px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">{pillar.label}</div>
            <div className="mt-3 text-base font-semibold text-slate-100">{pillar.value}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{pillar.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.8fr)]">
        <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Consultá a tu Twin</div>
              <div className="mt-1 text-xs text-slate-500">La primera capa de contexto real del portfolio ya está conectada.</div>
            </div>
            <span className="w-fit rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-300">Portfolio context · activo</span>
          </div>

          <div className="mt-6 rounded-[22px] border border-slate-800 bg-[#020617] p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Ejemplo de consulta</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">Tengo liquidez disponible. ¿Conviene desplegarla ahora o mantener parte en reserva?</p>
          </div>

          <div className="mt-4 rounded-[22px] border border-indigo-500/15 bg-indigo-500/[0.05] p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-300"><span className="h-2 w-2 rounded-full bg-indigo-400" /> Contexto que recibiría el Twin hoy</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Portfolio</div><div className="mt-2 font-semibold text-white">{formatCurrency(context.portfolioTotal, "USD")}</div></div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Crypto</div><div className="mt-2 font-semibold text-white">{formatPercent(context.cryptoWeight)}</div></div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Liquidez</div><div className="mt-2 font-semibold text-white">{formatCurrency(context.investableLiquidity, "USD")}</div></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              Todavía no enviamos esto a un LLM. Primero estamos verificando que el contexto determinístico que arma Portfolio Tracker sea correcto y suficientemente compacto.
            </p>
          </div>

          <div className="mt-5 flex gap-3">
            <input disabled placeholder="Escribí una decisión para analizar..." className="min-w-0 flex-1 rounded-2xl border border-slate-800 bg-[#020617] px-4 py-3 text-sm text-slate-500 outline-none" />
            <button disabled type="button" className="rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-3 text-sm font-medium text-white opacity-50">Analizar</button>
          </div>
        </article>

        <aside className="space-y-5">
          <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="text-sm font-semibold text-white">Estado del Twin</div>
            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-center justify-between"><span className="text-slate-500">Portfolio context</span><span className="text-emerald-300">Conectado</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Planner context</span><span className="text-amber-300">Siguiente</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Investor model</span><span className="text-amber-300">Pendiente</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Decision memory</span><span className="text-amber-300">Pendiente</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">LLM</span><span className="text-amber-300">Pendiente</span></div>
            </div>
          </article>

          <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">Contexto real</div><span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Ahora</span></div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Liquidez total</span><span className="tabular-nums text-slate-200">{formatCurrency(context.investableLiquidity, "USD")}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">USDT</span><span className="tabular-nums text-slate-200">{formatCurrency(context.usdt, "USD")}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Crypto</span><span className="tabular-nums text-slate-200">{formatCurrency(context.crypto, "USD")}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Mayor concentración</span><span className="tabular-nums text-slate-200">{formatPercent(context.topWeight)}</span></div>
            </div>
            {context.topHoldings.length > 0 && <div className="mt-5 border-t border-slate-800 pt-4"><div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">Principales posiciones</div><div className="space-y-2">{context.topHoldings.map((holding) => <div key={holding.ticker} className="flex items-center justify-between gap-4 text-xs"><span className="font-medium text-slate-300">{holding.ticker}</span><span className="tabular-nums text-slate-500">{formatCurrency(holding.value, "USD")} · {formatPercent(holding.weight)}</span></div>)}</div></div>}
          </article>

          <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5">
            <div className="text-sm font-semibold text-white">Principio de diseño</div>
            <p className="mt-3 text-xs leading-5 text-slate-400">Los números los calcula Portfolio Tracker. El LLM interpreta, compara, desafía y explica; no inventa el estado de la cartera.</p>
          </article>
        </aside>
      </div>
    </section>
  );
}
