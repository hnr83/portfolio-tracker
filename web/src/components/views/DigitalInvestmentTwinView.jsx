import React from "react";

const pillars = [
  { label: "Quién soy", value: "En construcción", detail: "Preferencias, convicciones, tolerancia y estilo de decisión." },
  { label: "Dónde estoy", value: "Portfolio real", detail: "Posiciones, liquidez, concentración, performance y exposición." },
  { label: "A dónde voy", value: "Plan", detail: "Objetivos, horizonte, aportes y trayectoria esperada." },
  { label: "Cómo cambio", value: "Aprendizaje", detail: "Decisiones recientes, cambios de postura y contradicciones." },
];

export default function DigitalInvestmentTwinView() {
  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <article className="rounded-[26px] border border-slate-800/80 bg-slate-950/55 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Consultá a tu Twin</div>
              <div className="mt-1 text-xs text-slate-500">La respuesta va a combinar tu portfolio, tu plan y tu contexto personal.</div>
            </div>
            <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-300">Context builder pendiente</span>
          </div>

          <div className="mt-6 rounded-[22px] border border-slate-800 bg-[#020617] p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Ejemplo de consulta</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">Tengo liquidez disponible. ¿Conviene desplegarla ahora o mantener parte en reserva?</p>
          </div>

          <div className="mt-4 rounded-[22px] border border-indigo-500/15 bg-indigo-500/[0.05] p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-300"><span className="h-2 w-2 rounded-full bg-indigo-400" /> Respuesta del Twin</div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              En la siguiente etapa esta respuesta se generará con datos reales. La PoC separará explícitamente hechos calculados por la app, interpretación del modelo, riesgos y alineación con tu trayectoria.
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
              <div className="flex items-center justify-between"><span className="text-slate-500">Portfolio context</span><span className="text-amber-300">Pendiente</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Investor model</span><span className="text-amber-300">Pendiente</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Decision memory</span><span className="text-amber-300">Pendiente</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">LLM</span><span className="text-amber-300">Pendiente</span></div>
            </div>
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
