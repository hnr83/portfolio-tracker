import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function formatCurrency(value, currency = "USD") {
  if (value == null || isNaN(value)) return "-";

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  if (value == null || isNaN(value)) return "-";
  return `${Number(value).toFixed(2)}%`;
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default function App() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/portfolio/summary`)
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch((err) => console.error("Error fetching summary:", err));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Portfolio Dashboard
        </h1>
        <p className="mt-2 text-slate-400">
          Resumen general del portfolio
        </p>

        {!summary && (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
            Cargando resumen...
          </div>
        )}

        {summary && (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Market USD"
              value={formatCurrency(summary.total_market_usd, "USD")}
            />
            <SummaryCard
              title="Market ARS"
              value={formatCurrency(summary.total_market_ars, "ARS")}
            />
            <SummaryCard
              title="PnL USD"
              value={formatCurrency(summary.total_pnl_usd, "USD")}
            />
            <SummaryCard
              title="PnL %"
              value={formatPercent(summary.total_pnl_pct)}
            />
          </div>
        )}
      </div>
    </div>
  );
}