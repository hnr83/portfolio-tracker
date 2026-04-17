import React from "react";
import PinIcon from "../shared/PinIcon";

export default function KpiVisibilityRail({
  isOpen,
  isPinned,
  onToggle,
  onPinToggle,
}) {
  return (
    <div className="relative my-7">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800/90 to-transparent" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/90 px-1.5 py-1 shadow-[0_14px_35px_rgba(0,0,0,0.35)] backdrop-blur">
          <button
            type="button"
            onClick={onToggle}
            disabled={isPinned}
            title=""
            className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all ${
              isPinned
                ? "cursor-not-allowed text-slate-500"
                : "text-slate-200 hover:bg-slate-800/90 hover:text-white"
            }`}
          >
            <span
              className={`text-[11px] transition-transform duration-300 ${
                isOpen ? "rotate-180" : "rotate-0"
              }`}
            >
              ▼
            </span>
          </button>

          <div className="h-5 w-px bg-slate-700/80" />

          <button
            type="button"
            onClick={onPinToggle}
            title={isPinned ? "Desbloquear preferencia de KPIs" : "Bloquear preferencia de KPIs"}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-all ${
              isPinned
                ? "bg-indigo-500/14 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "text-slate-400 hover:bg-slate-800/90 hover:text-white"
            }`}
          >
            <PinIcon active={isPinned} />
          </button>
        </div>
      </div>
    </div>
  );
}