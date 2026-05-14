import React from "react";

export default function SummaryCard({
  title,
  value,
  subtitle,
  subtitleClassName = "text-slate-400",
  icon,
}) {
  return (
    <div className="h-full min-h-[106px] min-w-0 overflow-hidden rounded-[18px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,18,40,0.96)_0%,rgba(6,10,28,0.98)_100%)] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur-sm sm:min-h-[112px] sm:p-5 2xl:min-h-[120px] 2xl:rounded-[22px] 2xl:p-5">
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/12 text-indigo-300 2xl:h-11 2xl:w-11 2xl:rounded-2xl">
          <span className="text-base leading-none 2xl:text-lg">{icon}</span>
        </div>

        <p className="min-w-0 text-[11px] uppercase leading-[1.55] tracking-[0.22em] text-slate-500 2xl:text-xs 2xl:tracking-[0.26em]">
          {title}
        </p>
      </div>

      <div className="mt-3 min-w-0">
        <p className="whitespace-nowrap text-[21px] font-semibold leading-none tracking-tight text-white tabular-nums sm:text-[22px] xl:text-[23px] 2xl:text-[26px]">
          {value}
        </p>

        {subtitle ? (
          <p
            className={`mt-3 whitespace-nowrap text-[12px] tabular-nums 2xl:text-sm ${
              subtitleClassName || "text-slate-400"
            }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}