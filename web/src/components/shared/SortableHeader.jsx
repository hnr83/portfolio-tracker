import React from "react";
import { toggleSort } from "../../utils/sort";

export default function SortableHeader({
  label,
  sortKey,
  sortState,
  onSort,
  align = "left",
  className = "",
}) {
  const isActive = sortState.key === sortKey;
  const arrow = isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "";

  return (
    <th
      className={`cursor-pointer select-none px-4 py-3 text-xs uppercase tracking-[0.16em] text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
      onClick={() => onSort((prev) => toggleSort(prev, sortKey))}
    >
      <span className="inline-flex items-center gap-2">
        <span>{label}</span>
        <span className={`text-[10px] ${isActive ? "text-indigo-400" : "text-slate-600"}`}>
          {arrow}
        </span>
      </span>
    </th>
  );
}