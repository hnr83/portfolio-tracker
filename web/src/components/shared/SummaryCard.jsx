import React from "react";

export default function SummaryCard({ title,
  value,
  subtitle,
  subtitleClassName = "text-slate-400",
  icon, }) {
  return (
    <div className="h-full min-w-0 rounded-[18px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,18,40,0.96)_0%,rgba(6,10,28,0.98)_100%)] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:rounded-[22px] sm:p-5">
      <div className="flex items-center gap-2.5 sm:gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/12 text-indigo-300 sm:h-11 sm:w-11 sm:rounded-2xl">
          <span className="text-sm sm:text-lg">{icon}</span>
        </div>

        <p className="min-w-0 text-[9px] uppercase leading-snug tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.22em]">
          {title}
        </p>
      </div>

      <div className="mt-3 min-w-0 sm:mt-4">
        <p className="truncate text-[21px] font-semibold leading-tight tracking-tight text-white tabular-nums sm:break-keep sm:text-[clamp(1.7rem,1.8vw,2.45rem)]">
          {value}
        </p>

        {subtitle ? (
          <p
            className={`mt-1.5 truncate text-[11px] tabular-nums sm:mt-3 sm:text-sm ${subtitleClassName || "text-slate-400"
              }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}