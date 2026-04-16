import { useEffect, useState } from "react";
import TransactionModal from "./TransactionModal";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

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
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatPortfolioPercent(value) {
  if (value == null || isNaN(value)) return "-";
  return `${Number(value).toFixed(2)}%`;
}

function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return "-";

  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Sidebar({
  summary,
  activeView,
  setActiveView,
  loadMovements,
  loadHoldings,
}) {
  const navClass = (view) =>
    `cursor-pointer rounded-xl px-4 py-3 transition ${activeView === view
      ? "border border-slate-700 bg-slate-900 text-white"
      : "text-slate-400 hover:bg-slate-900 hover:text-white"
    }`;

  return (
    <aside className="flex min-h-screen w-72 flex-col border-r border-slate-800 bg-slate-950 px-5 py-6">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Portfolio
        </div>
        <div className="mt-2 text-3xl font-bold tracking-tight text-white">
          Tracker
        </div>
        <div className="mt-2 text-sm text-slate-400">
          Dashboard de inversiones
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Portfolio Value
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {formatCurrency(summary?.total_market_usd, "USD")}
        </div>
        <div className="mt-1 text-sm text-slate-400">
          {summary
            ? formatCurrency(summary.total_market_ars, "ARS")
            : "Cargando..."}
        </div>
      </div>

      <nav className="mt-8 space-y-2">
        <div
          onClick={() => setActiveView("dashboard")}
          className={navClass("dashboard")}
        >
          Portfolio Jubilación
        </div>

        <div
          onClick={() => {
            setActiveView("transactions");
            loadMovements();
          }}
          className={navClass("transactions")}
        >
          Transacciones
        </div>

        <div
          onClick={() => {
            setActiveView("holdings");
            loadHoldings();
          }}
          className={navClass("holdings")}
        >
          Holdings
        </div>

        <div
          onClick={() => setActiveView("history")}
          className={navClass("history")}
        >
          Histórico
        </div>
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="text-sm font-medium text-white">Estado</div>
        <div className="mt-1 text-sm text-slate-400">
          Base lista para seguir creciendo con transacciones e histórico.
        </div>
      </div>
    </aside>
  );
}

export default function App() {

  const [selectedAssetMovements, setSelectedAssetMovements] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [movements, setMovements] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [investmentSearch, setInvestmentSearch] = useState("");
  const [investmentCategoryFilter, setInvestmentCategoryFilter] = useState("ALL");
  const [investmentSort, setInvestmentSort] = useState({
    key: "market_value_usd",
    direction: "desc",
  });
  const [movementSearch, setMovementSearch] = useState("");
  const [movementCategoryFilter, setMovementCategoryFilter] = useState("ALL");
  const [movementSort, setMovementSort] = useState({
    key: "fecha",
    direction: "desc",
  });


  function sortRows(rows, sortConfig) {
    const { key, direction } = sortConfig;

    return [...rows].sort((a, b) => {
      const aValue = a?.[key];
      const bValue = b?.[key];

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (typeof aValue === "number" && typeof bValue === "number") {
        return direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      const aText = String(aValue).toLowerCase();
      const bText = String(bValue).toLowerCase();

      if (aText < bText) return direction === "asc" ? -1 : 1;
      if (aText > bText) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  function toggleSort(currentSort, key) {
    if (currentSort.key === key) {
      return {
        key,
        direction: currentSort.direction === "asc" ? "desc" : "asc",
      };
    }

    return {
      key,
      direction: "asc",
    };
  }

  async function openAssetTransactions(ticker) {
    setSelectedAssetMovements(ticker);
    setActiveView("transactions");
    await loadMovements(ticker);
  }

  async function loadMovements(asset = null) {
    try {
      const url = asset
        ? `/api/portfolio/movements?asset=${encodeURIComponent(asset)}`
        : "/api/portfolio/movements";

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Movements HTTP ${res.status}`);
      }

      const data = await res.json();

      console.log("MOVEMENTS:", data);
      setMovements(data);
    } catch (err) {
      console.error("Error loading movements:", err);
    }
  }

  async function loadHoldings() {
    try {
      const res = await fetch("/api/portfolio/holdings");
      if (!res.ok) {
        throw new Error(`Holdings HTTP ${res.status}`);
      }
      const data = await res.json();
      setHoldings(data);
    } catch (err) {
      console.error("Error loading holdings:", err);
    }
  }

  async function refreshMarketData() {
    try {
      setIsRefreshing(true);
      setRefreshError("");

      const fxRes = await fetch("/api/jobs/update-fx", {
        method: "POST",
      });

      if (!fxRes.ok) {
        throw new Error(`update-fx HTTP ${fxRes.status}`);
      }

      const pricesRes = await fetch("/api/jobs/update-prices", {
        method: "POST",
      });

      if (!pricesRes.ok) {
        throw new Error(`update-prices HTTP ${pricesRes.status}`);
      }

      await loadData();
      if (activeView === "holdings") {
        await loadHoldings();
      }
      if (activeView === "transactions") {
        await loadMovements();
      }
    } catch (err) {
      console.error("Error refreshing market data:", err);
      setRefreshError(err.message || "Error actualizando datos");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function loadData() {
    try {
      const [summaryRes, investmentsRes, positionsRes] = await Promise.all([
        fetch("/api/portfolio/summary"),
        fetch("/api/portfolio/investments"),
        fetch("/api/portfolio/positions"),
      ]);

      if (!summaryRes.ok) {
        throw new Error(`Summary HTTP ${summaryRes.status}`);
      }

      if (!investmentsRes.ok) {
        throw new Error(`Investments HTTP ${investmentsRes.status}`);
      }

      if (!positionsRes.ok) {
        throw new Error(`Positions HTTP ${positionsRes.status}`);
      }

      const [summaryData, investmentsData, positionsData] = await Promise.all([
        summaryRes.json(),
        investmentsRes.json(),
        positionsRes.json(),
      ]);

      setSummary(summaryData);
      setInvestments(investmentsData);
      setPositions(positionsData);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }

  useEffect(() => {
    loadData();
  }, []);
  const filteredAndSortedMovements = sortRows(
    movements.filter((m) => {
      const search = movementSearch.toLowerCase();

      const matchesSearch =
        !search ||
        String(m.ticker || "").toLowerCase().includes(search) ||
        String(m.movement_type || "").toLowerCase().includes(search) ||
        String(m.broker || "").toLowerCase().includes(search);

      const matchesCategory =
        movementCategoryFilter === "ALL" ||
        m.category === movementCategoryFilter;

      return matchesSearch && matchesCategory;
    }),
    movementSort
  );

  const filteredAndSortedInvestments = sortRows(
    investments.filter((inv) => {
      const ticker = (inv.normalized_ticker || inv.ticker || "").toLowerCase();
      const category = (inv.category || "").toLowerCase();
      const search = investmentSearch.toLowerCase();

      const matchesSearch =
        !search ||
        ticker.includes(search) ||
        String(inv.ticker || "").toLowerCase().includes(search);

      const matchesCategory =
        investmentCategoryFilter === "ALL" ||
        inv.category === investmentCategoryFilter;

      const matchesSelectedTicker =
        !selectedTicker ||
        (inv.normalized_ticker || inv.ticker) === selectedTicker;

      return matchesSearch && matchesCategory && matchesSelectedTicker;
    }),
    investmentSort
  );

  const liquidityUsd = positions
    .filter((p) => ["CASH", "FX"].includes(p.category))
    .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);

  const cryptoUsd = positions
    .filter((p) => p.category === "CRYPTO")
    .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);

  const investmentsUsd = positions
    .filter((p) => p.category === "PORTFOLIO")
    .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);

  const totalPortfolioUsd = liquidityUsd + cryptoUsd + investmentsUsd;

  const chartData = filteredAndSortedInvestments
    .filter((inv) => (inv.market_value_usd || 0) > 0)
    .map((inv) => ({
      name: inv.normalized_ticker || inv.ticker,
      value: inv.market_value_usd || 0,
    }));

  const activeItem = activeIndex != null ? chartData[activeIndex] : null;

  const filteredInvestments = selectedTicker
    ? sortedInvestments.filter(
      (inv) => (inv.normalized_ticker || inv.ticker) === selectedTicker
    )
    : filteredAndSortedInvestments;

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <Sidebar
        summary={summary}
        activeView={activeView}
        setActiveView={setActiveView}
        loadMovements={loadMovements}
        loadHoldings={loadHoldings}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1600px] px-8 py-8">
          {activeView === "dashboard" && (
            <>
              <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">
                    Portfolio Jubilación
                  </h1>
                  <p className="mt-2 text-slate-400">
                    Visión general de tu portfolio y su evolución
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={refreshMarketData}
                    disabled={isRefreshing}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isRefreshing ? "Actualizando..." : "Actualizar datos"}
                  </button>

                  <button
                    onClick={() => setIsTransactionModalOpen(true)}
                    className="rounded-xl bg-black px-4 py-2 text-white"
                  >
                    + Agregar transacción
                  </button>
                </div>
              </div>

              {!summary && (
                <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
                  Cargando resumen...
                </div>
              )}

              {summary && (
                <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    title="Total Portfolio USD"
                    value={formatCurrency(totalPortfolioUsd, "USD")}
                  />
                  <SummaryCard
                    title="Investments USD"
                    value={formatCurrency(investmentsUsd, "USD")}
                  />
                  <SummaryCard
                    title="Liquidez USD"
                    value={formatCurrency(liquidityUsd, "USD")}
                  />
                  <SummaryCard
                    title="Crypto USD"
                    value={formatCurrency(cryptoUsd, "USD")}
                  />
                </div>
              )}

              {refreshError && (
                <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {refreshError}
                </div>
              )}

              {chartData.length > 0 && summary && (
                <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 xl:col-span-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold text-white">
                          Portfolio Composition
                        </div>
                        <div className="text-sm text-slate-400">
                          Allocation by current market value
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Valor Actual
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {formatCurrency(investmentsUsd, "USD")}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex w-full items-center justify-center">
                      <div className="w-full max-w-[520px]">
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={70}
                              outerRadius={115}
                              paddingAngle={3}
                              stroke="#0f172a"
                              strokeWidth={2}
                              onMouseEnter={(_, index) => setActiveIndex(index)}
                              onMouseLeave={() => setActiveIndex(null)}
                              onClick={(data) => setSelectedTicker(data.name)}
                            >
                              {chartData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                                  stroke={index === activeIndex ? "#ffffff" : "#0f172a"}
                                  strokeWidth={index === activeIndex ? 3 : 2}
                                />
                              ))}
                            </Pie>

                            <Tooltip
                              formatter={(value, name) => [
                                formatCurrency(value, "USD"),
                                name,
                              ]}
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                border: "1px solid #1e293b",
                                borderRadius: "14px",
                                color: "#fff",
                                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                              }}
                              labelStyle={{ color: "#cbd5e1" }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {activeItem && (
                      <div className="mt-2 text-center text-sm text-slate-400">
                        <span className="font-medium text-white">
                          {activeItem.name}
                        </span>{" "}
                        · {formatCurrency(activeItem.value, "USD")}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 xl:col-span-2">
                    <div className="mb-1 text-xl font-semibold text-white">
                      Top Holdings
                    </div>
                    <div className="text-sm text-slate-400">
                      Ranked by market value
                    </div>

                    <div className="mt-4 max-h-[300px] space-y-2 overflow-y-auto pr-1">
                      {chartData.map((item, index) => {
                        const pct = summary.total_market_usd
                          ? (item.value / summary.total_market_usd) * 100
                          : 0;

                        return (
                          <div
                            key={item.name}
                            onClick={() => setSelectedTicker(item.name)}
                            className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition ${selectedTicker === item.name
                              ? "border-blue-500 bg-slate-800/70"
                              : index === 0
                                ? "border-slate-600 bg-slate-950"
                                : "border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-950"
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{
                                  backgroundColor:
                                    CHART_COLORS[index % CHART_COLORS.length],
                                }}
                              />
                              <div>
                                <div className="font-medium text-white">
                                  {item.name}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {formatPortfolioPercent(pct)} of portfolio
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-medium text-white">
                                {formatCurrency(item.value, "USD")}
                              </div>
                              {index === 0 && (
                                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                                  Largest
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}




              {filteredAndSortedInvestments.length > 0 && (
                <div className="mt-14">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Investments</h2>

                    {selectedTicker && (
                      <button
                        onClick={() => setSelectedTicker(null)}
                        className="text-sm text-blue-400 hover:underline"
                      >
                        Clear filter ({selectedTicker})
                      </button>
                    )}
                  </div>

                  <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col gap-3 md:flex-row">
                      <input
                        type="text"
                        placeholder="Buscar ticker..."
                        value={investmentSearch}
                        onChange={(e) => setInvestmentSearch(e.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                      />

                      <select
                        value={investmentCategoryFilter}
                        onChange={(e) => setInvestmentCategoryFilter(e.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="ALL">Todas las categorías</option>
                        <option value="PORTFOLIO">PORTFOLIO</option>
                        <option value="CRYPTO">CRYPTO</option>
                        <option value="FX">FX</option>
                        <option value="CASH">CASH</option>
                      </select>
                    </div>

                    <div className="text-sm text-slate-400">
                      {filteredAndSortedInvestments.length} resultados
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="p-3 text-left" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "ticker"))}> Ticker</th>
                          <th className="p-3 text-left" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "normalized_ticker"))}>
                            Normalized
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "quantity_net"))}>
                            Qty
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "market_price"))}>
                            Price
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "market_value_usd"))}>
                            Market Value USD
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "portfolio_percentage"))}>
                            % Portfolio
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "cost_value_usd"))}>
                            Cost USD
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "pnl_usd"))}>
                            PnL USD
                          </th>
                          <th className="p-3 text-right" onClick={() =>
                            setInvestmentSort((prev) => toggleSort(prev, "pnl_pct"))}>
                            PnL %
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredInvestments.map((inv, i) => {
                          const portfolioPct = summary?.total_market_usd
                            ? (inv.market_value_usd / summary.total_market_usd) * 100
                            : null;

                          return (
                            <tr
                              key={`${inv.ticker}-${i}`}
                              onClick={() => openAssetTransactions(inv.normalized_ticker || inv.ticker)}
                              className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800/40 ${selectedTicker &&
                                (inv.normalized_ticker || inv.ticker) === selectedTicker
                                ? "bg-slate-800/60"
                                : ""
                                }`}
                            >
                              <td className="p-3 font-medium">{inv.ticker}</td>
                              <td className="p-3 text-slate-300">{inv.normalized_ticker}</td>
                              <td className="p-3 text-right">{formatNumber(inv.quantity_net, 4)}</td>
                              <td className="p-3 text-right">
                                {formatCurrency(inv.market_price, inv.price_currency || "USD")}
                              </td>
                              <td className="p-3 text-right">
                                {formatCurrency(inv.market_value_usd, "USD")}
                              </td>
                              <td className="p-3 text-right text-slate-300">
                                {formatPortfolioPercent(portfolioPct)}
                              </td>
                              <td className="p-3 text-right">
                                {formatCurrency(inv.cost_value_usd, "USD")}
                              </td>
                              <td
                                className={`p-3 text-right font-medium ${inv.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"
                                  }`}
                              >
                                {formatCurrency(inv.pnl_usd, "USD")}
                              </td>
                              <td
                                className={`p-3 text-right font-medium ${inv.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"
                                  }`}
                              >
                                {formatPercent(inv.pnl_pct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {activeView === "transactions" && (
            <div className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-semibold">
                  {selectedAssetMovements
                    ? `Transacciones - ${selectedAssetMovements}`
                    : "Transacciones"}
                </h2>

                {selectedAssetMovements && (
                  <button
                    onClick={async () => {
                      setSelectedAssetMovements(null);
                      await loadMovements();
                    }}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    Ver todas
                  </button>
                )}
              </div>

              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3 md:flex-row">
                  <input
                    type="text"
                    placeholder="Buscar ticker, tipo o broker..."
                    value={movementSearch}
                    onChange={(e) => setMovementSearch(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  />

                  <select
                    value={movementCategoryFilter}
                    onChange={(e) => setMovementCategoryFilter(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="ALL">Todas las categorías</option>
                    <option value="PORTFOLIO">PORTFOLIO</option>
                    <option value="CRYPTO">CRYPTO</option>
                    <option value="FX">FX</option>
                    <option value="CASH">CASH</option>
                  </select>
                </div>

                <div className="text-sm text-slate-400">
                  {filteredAndSortedMovements.length} resultados
                </div>
              </div>
              <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-slate-400">
                    <tr>
                      <th className="p-3 text-left">Fecha</th>
                      <th className="p-3 text-left">Tipo</th>
                      <th className="p-3 text-left">Categoría</th>
                      <th className="p-3 text-left">Ticker</th>
                      <th className="p-3 text-left">Instrumento</th>
                      <th className="p-3 text-right">Cantidad</th>
                      <th className="p-3 text-right">Precio Unit.</th>
                      <th className="p-3 text-right">Monto Bruto</th>
                      <th className="p-3 text-right">Monto Neto</th>
                      <th className="p-3 text-left">Broker</th>
                      <th className="p-3 text-left">Owner</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedMovements.map((m, i) => (
                      <tr
                        key={m.id || i}
                        className={`border-t border-slate-800 ${selectedAssetMovements &&
                          m.ticker === selectedAssetMovements
                          ? "bg-slate-800/60"
                          : ""
                          }`}
                      >
                        <td className="p-3">
                          {m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "-"}
                        </td>
                        <td className="p-3">{m.movement_type}</td>
                        <td className="p-3">{m.category}</td>
                        <td className="p-3">{m.ticker}</td>
                        <td className="p-3">{m.instrument_type || "-"}</td>
                        <td className="p-3 text-right">
                          {m.quantity == null ? "-" : formatNumber(m.quantity, 4)}
                        </td>
                        <td className="p-3 text-right">
                          {m.unit_price == null
                            ? "-"
                            : formatCurrency(m.unit_price, m.price_currency || "USD")}
                        </td>
                        <td className="p-3 text-right">
                          {m.gross_amount == null
                            ? "-"
                            : formatCurrency(
                              m.gross_amount,
                              m.settlement_currency || m.price_currency || "USD"
                            )}
                        </td>
                        <td className="p-3 text-right">
                          {m.net_amount == null
                            ? "-"
                            : formatCurrency(
                              m.net_amount,
                              m.settlement_currency || m.price_currency || "USD"
                            )}
                        </td>
                        <td className="p-3">{m.broker || "-"}</td>
                        <td className="p-3">{m.owner || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === "holdings" && (
            <div className="mt-8">
              <h2 className="mb-4 text-2xl font-semibold">Holdings</h2>

              <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-slate-400">
                    <tr>
                      <th className="p-3 text-left">Ticker</th>
                      <th className="p-3 text-left">Categoría</th>
                      <th className="p-3 text-right">Cantidad</th>
                      <th className="p-3 text-right">Valor USD</th>
                      <th className="p-3 text-right">PnL</th>
                    </tr>
                  </thead>

                  <tbody>
                    {holdings.map((h, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="p-3">{h.normalized_ticker || h.ticker}</td>
                        <td className="p-3">{h.category}</td>
                        <td className="p-3 text-right">
                          {formatNumber(h.quantity_net, 4)}
                        </td>
                        <td className="p-3 text-right">
                          {formatCurrency(h.market_value_usd, "USD")}
                        </td>
                        <td
                          className={`p-3 text-right ${h.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                        >
                          {formatCurrency(h.pnl_usd, "USD")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === "history" && (
            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-2xl font-semibold text-white">Histórico</h2>
              <p className="mt-2 text-slate-400">
                Próximamente: evolución temporal del portfolio.
              </p>
            </div>
          )}
        </div>
      </main>

      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        onSaved={async () => {
          await loadData();
          if (activeView === "holdings") {
            await loadHoldings();
          }
          if (activeView === "transactions") {
            await loadMovements();
          }
        }}
      />
    </div>
  );
}