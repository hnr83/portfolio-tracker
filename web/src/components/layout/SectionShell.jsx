import React from "react";

export default function SectionShell({ children, className = "" }) {
  return (
    <div
      className={`rounded-[24px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(7,12,30,0.92)_0%,rgba(3,8,23,0.92)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.20)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}