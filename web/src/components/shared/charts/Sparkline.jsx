export function Sparkline({ points = [] }) {
  const values = points
    .map((p) => Number(p.price))
    .filter((v) => Number.isFinite(v));

  if (values.length < 2) {
    return <span className="text-xs text-slate-600">-</span>;
  }

  const width = 100;
  const height = 34;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const isUp = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={path}
        fill="none"
        stroke={isUp ? "#22c55e" : "#ef4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}