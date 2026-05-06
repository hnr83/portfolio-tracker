import React from "react";

export default function SectionShell({ children, className = "" }) {
  return (
    <section
      className={`w-full overflow-hidden rounded-[20px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(7,12,30,0.92)_0%,rgba(3,8,23,0.92)_100%)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.20)] backdrop-blur-sm sm:rounded-[24px] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}