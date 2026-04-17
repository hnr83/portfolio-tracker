import React from "react";

export default function FilterToolbar({ children, right }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 rounded-[18px] border border-slate-800/80 bg-slate-950/80 p-3 md:flex-row">
        {children}
      </div>
      {right ? <div className="text-sm text-slate-400">{right}</div> : null}
    </div>
  );
}