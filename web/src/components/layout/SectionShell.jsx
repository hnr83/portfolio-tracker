import React from "react";

export default function SectionShell({
  children,
  className = "",
}) {
  return (
    <section
      className={`w-full overflow-hidden rounded-[18px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(7,12,30,0.92)_0%,rgba(3,8,23,0.92)_100%)] p-3 shadow-[0_14px_36px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:p-4 2xl:rounded-[24px] 2xl:p-5 ${className}`}
    >
      {children}
    </section>
  );
}