import React from "react";

export default function SummaryCard({ title, value, subtitle, icon }) {
  return (
    <div className="h-full min-w-0 rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,18,40,0.96)_0%,rgba(6,10,28,0.98)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/12 text-indigo-300">
          <span className="text-lg">{icon}</span>
        </div>

        <p className="min-w-0 text-xs uppercase tracking-[0.22em] text-slate-500">
          {title}
        </p>
      </div>

      <div className="mt-4 min-w-0">
        <p className="break-keep text-[clamp(1.7rem,1.8vw,2.45rem)] font-semibold leading-tight tracking-tight text-white tabular-nums">
          {value}
        </p>
        {subtitle ? (
          <p className="mt-3 text-sm text-slate-400 tabular-nums">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}