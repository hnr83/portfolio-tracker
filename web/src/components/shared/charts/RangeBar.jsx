export function RangeBar({ low, high, position }) {
  if (low == null || high == null || position == null) return null;

  const pct = Math.min(Math.max(position * 100, 1), 99);

  const markerColor =
    pct > 80
      ? "bg-red-400/80"
      : pct < 20
      ? "bg-green-400/80"
      : "bg-white";

  return (
    <div className="flex w-full flex-col gap-1 text-xs">
      <div className="flex justify-between text-slate-400 tabular-nums">
        <span>{low.toFixed(0)}</span>
        <span>{high.toFixed(0)}</span>
      </div>

      <div className="relative h-2 rounded bg-slate-700">
        <div
          className="absolute top-0 h-2 rounded bg-blue-500"
          style={{ width: `${pct}%` }}
        />

        <div
          className={`absolute top-[-4px] h-4 w-2 rounded ${markerColor}`}
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="mt-1 text-right text-[10px] text-slate-500 tabular-nums">
        {(position * 100).toFixed(0)}%
      </div>
    </div>
  );
}