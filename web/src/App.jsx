import { useEffect, useMemo, useState } from "react";
import TransactionModal from "./TransactionModal";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = [
  "#5B7CFA",
  "#18C29C",
  "#F5B041",
  "#F45B69",
  "#8E6FF7",
  "#23B7E5",
  "#7ED957",
  "#FF8A4C",
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

function SortableHeader({
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
      className={`cursor-pointer select-none px-4 py-3 text-xs uppercase tracking-[0.16em] text-slate-500 ${align === "right" ? "text-right" : "text-left"
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

function SummaryCard({ title, value, subtitle, icon }) {
  return (
    <div className="h-full min-w-0 rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(12,18,40,0.96)_0%,rgba(6,10,28,0.98)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/12 text-indigo-300">
          <span className="text-lg">{icon}</span>
        </div>

        <p className="min-w-0 text-xs uppercase tracking-[0.22em] text-slate-500">
          {title}
        </p>
      </div>

      <div className="mt-4 min-w-0">
        <p className="break-keep text-[clamp(1.7rem,1.8vw,2.45rem)] font-semibold leading-tight tracking-tight text-white tabular-nums">
          {value}
        </p>
        {subtitle ? (
          <p className="mt-3 text-sm text-slate-400 tabular-nums">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function Sidebar({
  summary,
  activeView,
  setActiveView,
  loadMovements,
  loadHoldings,
  loadMarket,
  setSelectedAssetMovements,
}) {
  const navClass = (view) =>
    `group cursor-pointer rounded-2xl px-4 py-3 transition-all duration-200 ${activeView === view
      ? "border border-indigo-500/20 bg-[linear-gradient(90deg,rgba(93,124,250,0.18)_0%,rgba(93,124,250,0.08)_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      : "text-slate-400 hover:bg-slate-900/70 hover:text-white"
    }`;

  const dotClass = (view) =>
    `h-2 w-2 rounded-full transition-all ${activeView === view ? "bg-indigo-400" : "bg-slate-700 group-hover:bg-slate-500"
    }`;

  return (
    <aside className="flex min-h-screen w-72 flex-col border-r border-slate-800/80 bg-[#020617] px-5 py-6">
      <div className="px-2 pt-2">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-16 w-[3px] rounded-full bg-gradient-to-b from-indigo-300 via-indigo-400 to-indigo-600" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/90">
              Portfolio
            </div>
            <div className="mt-1 text-[28px] font-bold leading-none tracking-tight text-white">
              Jubilación
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,15,34,0.98)_0%,rgba(5,8,24,0.98)_100%)] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
          Valor de portfolio
        </div>
        <div className="mt-4 text-[24px] font-semibold text-white">
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
          <div className="flex items-center gap-3">
            <span className={dotClass("dashboard")} />
            <span className="font-medium">Portfolio Jubilación</span>
          </div>
        </div>

        <div
          onClick={async () => {
            setSelectedAssetMovements(null);
            setActiveView("transactions");
            await loadMovements();
          }}
          className={navClass("transactions")}
        >
          <div className="flex items-center gap-3">
            <span className={dotClass("transactions")} />
            <span>Transacciones</span>
          </div>
        </div>

        <div
          onClick={async () => {
            setActiveView("holdings");
            await loadHoldings();
          }}
          className={navClass("holdings")}
        >
          <div className="flex items-center gap-3">
            <span className={dotClass("holdings")} />
            <span>Holdings</span>
          </div>
        </div>

        <div
          onClick={async () => {
            setActiveView("market");
            await loadMarket(); // o refreshMarketData()
          }}
          className={navClass("market")}
        >
          <div className="flex items-center gap-3">
            <span className={dotClass("market")} />
            <span>Mercado</span>
          </div>
        </div>

        <div
          onClick={() => setActiveView("history")}
          className={navClass("history")}
        >
          <div className="flex items-center gap-3">
            <span className={dotClass("history")} />
            <span>Histórico</span>
          </div>
        </div>
      </nav>

      <div className="mt-auto rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,15,34,0.98)_0%,rgba(5,8,24,0.98)_100%)] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="text-sm font-medium uppercase tracking-[0.16em] text-slate-300">
            Estado
          </div>
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-400">
          Base lista para seguir creciendo con transacciones e histórico.
        </div>
      </div>
    </aside>
  );
}

function SectionShell({ children, className = "" }) {
  return (
    <div
      className={`rounded-[24px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(7,12,30,0.92)_0%,rgba(3,8,23,0.92)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.20)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

function FilterToolbar({ children, right }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 rounded-[18px] border border-slate-800/80 bg-slate-950/80 p-3 md:flex-row">
        {children}
      </div>
      {right ? <div className="text-sm text-slate-400">{right}</div> : null}
    </div>
  );
}



function PinIcon({ active = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 transition-transform duration-200 ${active ? "-rotate-12" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 3.5c1.8 0 3.2 1.4 3.2 3.2 0 .8-.3 1.6-.8 2.2l-1.2 1.3v3.1l1.4 1.4c.3.3.1.8-.3.8h-3.6l-1.8 5.2c-.1.4-.7.4-.8 0l-1.8-5.2H5.5c-.5 0-.7-.5-.3-.8l1.4-1.4v-3.1L5.4 8.9a3.19 3.19 0 0 1 4.6-4.4L11 5.4h2.1l1-1c.4-.6.9-.9 1.4-.9Z" />
    </svg>
  );
}

function KpiVisibilityRail({ isOpen, isPinned, onToggle, onPinToggle }) {
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

const inputBaseClass =
  "rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const buttonSecondaryClass =
  "rounded-2xl border border-slate-700/70 bg-transparent px-5 py-3 text-white transition-all duration-200 hover:bg-slate-800/60 disabled:opacity-50";
const buttonPrimaryClass =
  "rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-3 font-medium text-white shadow-[0_10px_30px_rgba(93,124,250,0.32)] transition-all duration-200 hover:opacity-90";

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
  const [showKpis, setShowKpis] = useState(true);
  const [pinKpis, setPinKpis] = useState(false);

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


  const [marketData, setMarketData] = useState([]);
  const [marketSearch, setMarketSearch] = useState("");
  const [marketTypeFilter, setMarketTypeFilter] = useState("ALL");
  const [marketSort, setMarketSort] = useState({
    key: "change_pct_1d",
    direction: "desc",
  });

async function loadMarket() {
  try {
    const res = await fetch("/api/portfolio/market");

    if (!res.ok) {
      throw new Error(`Market HTTP ${res.status}`);
    }

    const data = await res.json();

    const normalized = data.map((row) => ({
      ...row,
      market_price:
        row.market_price == null || row.market_price === ""
          ? null
          : Number(row.market_price),

      prev_market_price:
        row.prev_market_price == null || row.prev_market_price === ""
          ? null
          : Number(row.prev_market_price),

      change_1d:
        row.change_1d == null || row.change_1d === ""
          ? null
          : Number(row.change_1d),

      change_pct_1d:
        row.change_pct_1d == null || row.change_pct_1d === ""
          ? null
          : Number(row.change_pct_1d),

      ratio_numerator:
        row.ratio_numerator == null || row.ratio_numerator === ""
          ? null
          : Number(row.ratio_numerator),

      ratio_denominator:
        row.ratio_denominator == null || row.ratio_denominator === ""
          ? null
          : Number(row.ratio_denominator),

      underlying_price_usd:
        row.underlying_price_usd == null || row.underlying_price_usd === ""
          ? null
          : Number(row.underlying_price_usd),

      usdars:
        row.usdars == null || row.usdars === ""
          ? null
          : Number(row.usdars),
    }));

    setMarketData(normalized);
  } catch (err) {
    console.error("Error loading market:", err);
  }
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
      setMovements(data);
    } catch (err) {
      console.error("Error loading movements:", err);
    }
  }

  async function openAssetTransactions(ticker) {
    setSelectedAssetMovements(ticker);
    setActiveView("transactions");
    await loadMovements(ticker);
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
        await loadMovements(selectedAssetMovements);
      }

      if (activeView === "market") {
        await loadMarket();
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

  useEffect(() => {
    try {
      const savedPinned = window.localStorage.getItem("portfolio-kpis-pinned");
      const savedVisible = window.localStorage.getItem("portfolio-kpis-visible");

      if (savedPinned === "true") {
        setPinKpis(true);

        if (savedVisible === "false") {
          setShowKpis(false);
        }
      }
    } catch (error) {
      console.error("Error restoring KPI preference:", error);
    }
  }, []);

  useEffect(() => {
    try {
      if (pinKpis) {
        window.localStorage.setItem("portfolio-kpis-pinned", "true");
        window.localStorage.setItem("portfolio-kpis-visible", String(showKpis));
      } else {
        window.localStorage.removeItem("portfolio-kpis-pinned");
        window.localStorage.removeItem("portfolio-kpis-visible");
      }
    } catch (error) {
      console.error("Error persisting KPI preference:", error);
    }
  }, [pinKpis, showKpis]);

const filteredAndSortedMarket = useMemo(() => {
  return sortRows(
    marketData.filter((row) => {
      if (row.market_price == null) return false;

      const search = marketSearch.toLowerCase();

      const matchesSearch =
        !search ||
        String(row.ticker || "").toLowerCase().includes(search) ||
        String(row.underlying_ticker || "").toLowerCase().includes(search) ||
        String(row.ratio_text || "").toLowerCase().includes(search);

      const matchesType =
        marketTypeFilter === "ALL" ||
        (marketTypeFilter === "CEDEAR" && row.is_cedear) ||
        (marketTypeFilter === "NORMAL" && !row.is_cedear);

      return matchesSearch && matchesType;
    }),
    marketSort
  );
}, [marketData, marketSearch, marketTypeFilter, marketSort]);


  const marketTopStats = useMemo(() => {
    const validRows = marketData.filter(
      (row) =>
        row.market_price != null &&
        row.change_pct_1d != null &&
        row.ticker !== "USDT"
    );

    if (!validRows.length) {
      return {
        topGainer: null,
        topLoser: null,
      };
    }

    const sortedByChange = [...validRows].sort(
      (a, b) => Number(b.change_pct_1d || 0) - Number(a.change_pct_1d || 0)
    );

    return {
      topGainer: sortedByChange[0] || null,
      topLoser: sortedByChange[sortedByChange.length - 1] || null,
    };
  }, [marketData]);

  function MarketMoverCard({ title, row, positive = true }) {
    const accentClass = positive
      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
      : "border-red-500/20 bg-red-500/[0.04]";

    const valueClass = positive ? "text-emerald-400" : "text-red-400";
    const icon = positive ? "↑" : "↓";

    return (
      <div className={`rounded-2xl border p-4 shadow-sm ${accentClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
              {title}
            </div>

            <div className={`mt-2 text-3xl font-bold ${valueClass}`}>
              {row ? formatPercent(row.change_pct_1d) : "-"}
            </div>

            <div className="mt-3 text-lg font-semibold text-white">
              {row ? row.ticker : "-"}
            </div>

            <div className="mt-1 text-sm text-slate-400">
              {row && row.market_price != null
                ? formatCurrency(row.market_price, row.currency || "USD")
                : "-"}
            </div>

            <div className={`mt-3 text-sm font-medium ${valueClass}`}>
              {row && row.change_1d != null
                ? formatCurrency(row.change_1d, row.currency || "USD")
                : "-"}
            </div>
          </div>

          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              positive
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
          <span className="text-lg leading-none font-sans">
            {positive ? "↑" : "↓"}
          </span>
          </div>
        </div>
      </div>
    );
  }

  const filteredAndSortedMovements = useMemo(() => {
    return sortRows(
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
  }, [movements, movementSearch, movementCategoryFilter, movementSort]);

  const filteredAndSortedInvestments = useMemo(() => {
    return sortRows(
      investments.filter((inv) => {
        const ticker = (inv.normalized_ticker || inv.ticker || "").toLowerCase();
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
  }, [
    investments,
    investmentSearch,
    investmentCategoryFilter,
    selectedTicker,
    investmentSort,
  ]);

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


  const filteredInvestments = filteredAndSortedInvestments;

  const compositionTopCount = 5;
  const compositionBase = chartData.slice(0, compositionTopCount);
  const compositionOthersValue = chartData
    .slice(compositionTopCount)
    .reduce((acc, item) => acc + Number(item.value || 0), 0);

  const compositionData = compositionOthersValue > 0
    ? [
      ...compositionBase,
      {
        name: "Otros",
        value: compositionOthersValue,
      },
    ]
    : compositionBase;

  const activeItem = activeIndex != null ? compositionData[activeIndex] : null;

  function handleToggleKpis() {
    if (pinKpis) return;
    setShowKpis((prev) => !prev);
  }

  function handlePinKpisToggle() {
    setPinKpis((prev) => !prev);
  }

  return (
    <div className="flex min-h-screen bg-[#020617] text-white">
      <Sidebar
        summary={summary}
        activeView={activeView}
        setActiveView={setActiveView}
        loadMovements={loadMovements}
        loadHoldings={loadHoldings}
        loadMarket={loadMarket}
        setSelectedAssetMovements={setSelectedAssetMovements}
      />

      <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_left,rgba(78,99,255,0.16),transparent_22%),radial-gradient(circle_at_top_right,rgba(23,183,229,0.10),transparent_20%),linear-gradient(180deg,#030817_0%,#020617_100%)]">
        <div className="mx-auto max-w-[1600px] px-8 py-6">
          {activeView === "dashboard" && (
            <>
              <div className="flex flex-col gap-6 border-slate-800/80 pb-8 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-indigo-400">
                    Dashboard
                  </div>
                  <h1 className="mt-3 text-5xl font-bold tracking-tight text-white">
                    Portfolio <span className="text-indigo-400">Jubilación</span>
                  </h1>
                  <p className="mt-3 max-w-2xl text-base text-slate-400">
                    Visión general de tu portfolio y su evolución
                  </p>
                </div>

                

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={refreshMarketData}
                    disabled={isRefreshing}
                    className={buttonSecondaryClass}
                  >
                    {isRefreshing ? "Actualizando..." : "Actualizar datos"}
                  </button>

                  <button
                    onClick={() => setIsTransactionModalOpen(true)}
                    className={buttonPrimaryClass}
                  >
                    + Agregar transacción
                  </button>
                </div>
              </div>

              <KpiVisibilityRail
                isOpen={showKpis}
                isPinned={pinKpis}
                onToggle={handleToggleKpis}
                onPinToggle={handlePinKpisToggle}
              />

              {!summary && (
                <SectionShell className="mt-10">
                  <div className="text-slate-300">Cargando resumen...</div>
                </SectionShell>
              )}

              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  showKpis ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
                }`}
                aria-hidden={!showKpis}
              >
                {summary && (
                  <div className="grid grid-cols-1 gap-4 pb-1 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    title="Total Portfolio USD"
                    value={formatCurrency(totalPortfolioUsd, "USD")}
                    subtitle={formatCurrency(summary.total_market_ars, "ARS")}
                    icon="◫"
                  />
                  <SummaryCard
                    title="Investments USD"
                    value={formatCurrency(investmentsUsd, "USD")}
                    icon="↗"
                  />
                  <SummaryCard
                    title="Liquidez USD"
                    value={formatCurrency(liquidityUsd, "USD")}
                    icon="◉"
                  />
                  <SummaryCard
                    title="Crypto USD"
                    value={formatCurrency(cryptoUsd, "USD")}
                    icon="₿"
                  />
                </div>
                )}
              </div>

              {refreshError && (
                <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {refreshError}
                </div>
              )}

              {chartData.length > 0 && summary && (
                <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-5">
                  <SectionShell className="xl:col-span-3 h-[480px] lg:h-[560px] xl:h-[620px]">
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[20px] font-semibold text-white">
                            Portfolio Composition
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            Allocation by current market value
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Valor Actual
                          </div>
                          <div className="mt-1 text-[clamp(1.4rem,1.8vw,2.1rem)] font-semibold leading-tight text-white tabular-nums">
                            {formatCurrency(investmentsUsd, "USD")}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="flex h-full w-full items-center justify-center">
                          <div className="w-full max-w-[430px]">
                            <ResponsiveContainer width="100%" height={320}>
                              <PieChart>
                                <Pie
                                  data={compositionData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={78}
                                  outerRadius={122}
                                  paddingAngle={3}
                                  stroke="#07101F"
                                  strokeWidth={2}
                                  onMouseEnter={(_, index) => setActiveIndex(index)}
                                  onMouseLeave={() => setActiveIndex(null)}
                                  onClick={(data) => {
                                    if (data?.name !== "Otros") {
                                      setSelectedTicker(data.name);
                                    }
                                  }}
                                >
                                  {compositionData.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                                      stroke={index === activeIndex ? "#ffffff" : "#07101F"}
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
                                    backgroundColor: "#0b1220",
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

                        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                          {compositionData.map((item, index) => {
                            const pct = summary.total_market_usd
                              ? (item.value / summary.total_market_usd) * 100
                              : 0;
                            const isOthers = item.name === "Otros";

                            return (
                              <button
                                key={item.name}
                                onClick={() => {
                                  if (!isOthers) {
                                    setSelectedTicker(item.name);
                                  }
                                }}
                                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${!isOthers && selectedTicker === item.name
                                  ? "border-indigo-500/40 bg-indigo-500/10"
                                  : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700"
                                  } ${isOthers ? "cursor-default" : "cursor-pointer"}`}
                              >
                                <span
                                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor:
                                      CHART_COLORS[index % CHART_COLORS.length],
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-white">
                                    {item.name}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    {isOthers
                                      ? `${formatPortfolioPercent(pct)} · ${Math.max(chartData.length - compositionTopCount, 0)} posiciones`
                                      : `${formatPortfolioPercent(pct)} del portfolio`}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-2 pb-1 text-center text-sm text-slate-400">
                        {activeItem ? (
                          <>
                            <span className="font-medium text-white">
                              {activeItem.name}
                            </span>{" "}
                            · {formatCurrency(activeItem.value, "USD")}
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-white">
                              Top {Math.min(compositionTopCount, chartData.length)} + otros
                            </span>{" "}
                            · click en un holding para filtrar la tabla
                          </>
                        )}
                      </div>
                    </div>
                  </SectionShell>

                  <SectionShell className="xl:col-span-2 h-[480px] lg:h-[560px] xl:h-[620px]">
                    <div className="flex h-full flex-col">
                      <div>
                        <div className="mb-1 text-[20px] font-semibold text-white">
                          Top Holdings
                        </div>
                        <div className="text-sm text-slate-400">
                          Ranked by market value
                        </div>
                      </div>

                      <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
                        {chartData.map((item, index) => {
                          const pct = summary.total_market_usd
                            ? (item.value / summary.total_market_usd) * 100
                            : 0;

                          return (
                            <div
                              key={item.name}
                              onClick={() => setSelectedTicker(item.name)}
                              className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-all ${selectedTicker === item.name
                                ? "border-indigo-500 bg-indigo-500/10"
                                : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                                }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span
                                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor:
                                      CHART_COLORS[index % CHART_COLORS.length],
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-white">
                                    {item.name}
                                  </div>
                                  <div className="text-[12px] text-slate-500">
                                    {formatPortfolioPercent(pct)} del portfolio
                                  </div>
                                </div>
                              </div>

                              <div className="pl-4 text-right">
                                <div className="text-sm font-semibold text-white tabular-nums whitespace-nowrap">
                                  {formatCurrency(item.value, "USD")}
                                </div>
                                {index === 0 && (
                                  <div className="mt-1 inline-flex rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-300">
                                    Largest
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </SectionShell>
                </div>
              )}

              {filteredAndSortedInvestments.length > 0 && (
                <SectionShell className="mt-16">
                  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-white">
                        Investments
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Posiciones actuales del portfolio
                      </p>
                    </div>

                    <div className="text-sm text-slate-400">
                      {filteredInvestments.length} resultados
                    </div>
                  </div>

                  <FilterToolbar
                    right={
                      selectedTicker ? (
                        <button
                          onClick={() => setSelectedTicker(null)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-indigo-400 transition hover:bg-slate-900"
                        >
                          Clear filter ({selectedTicker})
                        </button>
                      ) : null
                    }
                  >
                    <input
                      type="text"
                      placeholder="Buscar ticker..."
                      value={investmentSearch}
                      onChange={(e) => setInvestmentSearch(e.target.value)}
                      className={inputBaseClass}
                    />

                    <select
                      value={investmentCategoryFilter}
                      onChange={(e) => setInvestmentCategoryFilter(e.target.value)}
                      className={inputBaseClass}
                    >
                      <option value="ALL">Todas las categorías</option>
                      <option value="PORTFOLIO">PORTFOLIO</option>
                      <option value="CRYPTO">CRYPTO</option>
                      <option value="FX">FX</option>
                      <option value="CASH">CASH</option>
                    </select>
                  </FilterToolbar>

                  <div className="overflow-x-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-950/95 text-slate-400">
                        <tr>
                          <SortableHeader
                            label="Ticker"
                            sortKey="ticker"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                          />
                          <SortableHeader
                            label="Normalized"
                            sortKey="normalized_ticker"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                          />
                          <SortableHeader
                            label="Qty"
                            sortKey="quantity_net"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                            align="right"
                          />
                          <SortableHeader
                            label="Price"
                            sortKey="market_price"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                            align="right"
                          />
                          <SortableHeader
                            label="Market Value USD"
                            sortKey="market_value_usd"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                            align="right"
                          />
                          <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                            % Portfolio
                          </th>
                          <SortableHeader
                            label="Cost USD"
                            sortKey="cost_value_usd"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                            align="right"
                          />
                          <SortableHeader
                            label="PnL USD"
                            sortKey="pnl_usd"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                            align="right"
                          />
                          <SortableHeader
                            label="PnL %"
                            sortKey="pnl_pct"
                            sortState={investmentSort}
                            onSort={setInvestmentSort}
                            align="right"
                          />
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
                              onClick={() => openAssetTransactions(inv.ticker)}
                              className={`cursor-pointer border-t border-slate-800/80 transition-colors hover:bg-slate-800/30 ${selectedTicker &&
                                (inv.normalized_ticker || inv.ticker) === selectedTicker
                                ? "bg-indigo-500/8"
                                : ""
                                }`}
                            >
                              <td className="px-4 py-4 font-semibold text-white">
                                {inv.ticker}
                              </td>
                              <td className="px-4 py-4 text-slate-300">
                                {inv.normalized_ticker}
                              </td>
                              <td className="px-4 py-4 text-right">
                                {formatNumber(inv.quantity_net, 4)}
                              </td>
                              <td className="px-4 py-4 text-right">
                                {formatCurrency(inv.market_price, inv.price_currency || "USD")}
                              </td>
                              <td className="px-4 py-4 text-right tabular-nums">
                                {formatCurrency(inv.market_value_usd, "USD")}
                              </td>
                              <td className="px-4 py-4 text-right text-slate-300 tabular-nums">
                                {formatPortfolioPercent(portfolioPct)}
                              </td>
                              <td className="px-4 py-4 text-right tabular-nums">
                                {formatCurrency(inv.cost_value_usd, "USD")}
                              </td>
                              <td
                                className={`px-4 py-4 text-right font-semibold tabular-nums ${inv.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"
                                  }`}
                              >
                                {formatCurrency(inv.pnl_usd, "USD")}
                              </td>
                              <td
                                className={`px-4 py-4 text-right font-semibold tabular-nums ${inv.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"
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
                </SectionShell>
              )}
            </>
          )}

          {activeView === "transactions" && (
            <SectionShell className="mt-8">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {selectedAssetMovements
                      ? `Transacciones - ${selectedAssetMovements}`
                      : "Transacciones"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Historial completo de movimientos
                  </p>
                </div>

                {selectedAssetMovements && (
                  <button
                    onClick={async () => {
                      setSelectedAssetMovements(null);
                      await loadMovements();
                    }}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-indigo-400 transition hover:bg-slate-900"
                  >
                    Ver todas
                  </button>
                )}
              </div>

              <FilterToolbar
                right={`${filteredAndSortedMovements.length} resultados`}
              >
                <input
                  type="text"
                  placeholder="Buscar ticker, tipo o broker..."
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  className={inputBaseClass}
                />

                <select
                  value={movementCategoryFilter}
                  onChange={(e) => setMovementCategoryFilter(e.target.value)}
                  className={inputBaseClass}
                >
                  <option value="ALL">Todas las categorías</option>
                  <option value="PORTFOLIO">PORTFOLIO</option>
                  <option value="CRYPTO">CRYPTO</option>
                  <option value="FX">FX</option>
                  <option value="CASH">CASH</option>
                </select>
              </FilterToolbar>

              <div className="overflow-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/95 text-slate-400">
                    <tr>
                      <SortableHeader
                        label="Fecha"
                        sortKey="fecha"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                      <SortableHeader
                        label="Tipo"
                        sortKey="movement_type"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                      <SortableHeader
                        label="Categoría"
                        sortKey="category"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                      <SortableHeader
                        label="Ticker"
                        sortKey="ticker"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                      <SortableHeader
                        label="Instrumento"
                        sortKey="instrument_type"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                      <SortableHeader
                        label="Cantidad"
                        sortKey="quantity"
                        sortState={movementSort}
                        onSort={setMovementSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Precio Unit."
                        sortKey="unit_price"
                        sortState={movementSort}
                        onSort={setMovementSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Monto Bruto"
                        sortKey="gross_amount"
                        sortState={movementSort}
                        onSort={setMovementSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Monto Neto"
                        sortKey="net_amount"
                        sortState={movementSort}
                        onSort={setMovementSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Broker"
                        sortKey="broker"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                      <SortableHeader
                        label="Owner"
                        sortKey="owner"
                        sortState={movementSort}
                        onSort={setMovementSort}
                      />
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedMovements.map((m, i) => (
                      <tr
                        key={m.id || i}
                        className={`border-t border-slate-800/80 transition-colors hover:bg-slate-800/20 ${selectedAssetMovements && m.ticker === selectedAssetMovements
                          ? "bg-indigo-500/8"
                          : ""
                          }`}
                      >
                        <td className="px-4 py-4">
                          {m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "-"}
                        </td>
                        <td className="px-4 py-4">{m.movement_type}</td>
                        <td className="px-4 py-4">{m.category}</td>
                        <td className="px-4 py-4 font-semibold text-white">{m.ticker}</td>
                        <td className="px-4 py-4">{m.instrument_type || "-"}</td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {m.quantity == null ? "-" : formatNumber(m.quantity, 4)}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {m.unit_price == null
                            ? "-"
                            : formatCurrency(m.unit_price, m.price_currency || "USD")}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {m.gross_amount == null
                            ? "-"
                            : formatCurrency(
                              m.gross_amount,
                              m.settlement_currency || m.price_currency || "USD"
                            )}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {m.net_amount == null
                            ? "-"
                            : formatCurrency(
                              m.net_amount,
                              m.settlement_currency || m.price_currency || "USD"
                            )}
                        </td>
                        <td className="px-4 py-4">{m.broker || "-"}</td>
                        <td className="px-4 py-4">{m.owner || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionShell>
          )}

          {activeView === "holdings" && (
            <SectionShell className="mt-8">
              <div className="mb-5">
                <h2 className="text-2xl font-semibold text-white">Holdings</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Posiciones agregadas por activo
                </p>
              </div>

              <div className="overflow-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/95 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                        Ticker
                      </th>
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                        Categoría
                      </th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                        Cantidad
                      </th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                        Valor USD
                      </th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.16em] text-slate-500">
                        PnL
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {holdings.map((h, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-800/80 transition-colors hover:bg-slate-800/20"
                      >
                        <td className="px-4 py-4 font-semibold text-white">
                          {h.normalized_ticker || h.ticker}
                        </td>
                        <td className="px-4 py-4">{h.category}</td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {formatNumber(h.quantity_net, 4)}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums">
                          {formatCurrency(h.market_value_usd, "USD")}
                        </td>
                        <td
                          className={`px-4 py-4 text-right font-semibold tabular-nums ${h.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                        >
                          {formatCurrency(h.pnl_usd, "USD")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionShell>
          )}

          {activeView === "market" && (
            <SectionShell className="mt-2">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Mercado</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Cotizaciones actuales y variación diaria
                  </p>
                </div>

                <div className="text-sm text-slate-400">
                  {filteredAndSortedMarket.length} resultados
                </div>
              </div>

              <FilterToolbar>
                <input
                  type="text"
                  placeholder="Buscar ticker, underlying o ratio..."
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  className={inputBaseClass}
                />

                <select
                  value={marketTypeFilter}
                  onChange={(e) => setMarketTypeFilter(e.target.value)}
                  className={inputBaseClass}
                >
                  <option value="ALL">Todos</option>
                  <option value="NORMAL">Normales</option>
                  <option value="CEDEAR">CEDEARs</option>
                </select>
              </FilterToolbar>

              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <MarketMoverCard
                  title="Mayor suba 1D"
                  row={marketTopStats.topGainer}
                  positive={true}
                />
                <MarketMoverCard
                  title="Mayor baja 1D"
                  row={marketTopStats.topLoser}
                  positive={false}
                />
              </div>           

              <div className="overflow-auto rounded-3xl border border-slate-800/80 bg-slate-900">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/95 text-slate-400">
                    <tr>
                      <SortableHeader
                        label="Ticker"
                        sortKey="ticker"
                        sortState={marketSort}
                        onSort={setMarketSort}
                      />
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                        Tipo
                      </th>
                      <SortableHeader
                        label="Precio"
                        sortKey="market_price"
                        sortState={marketSort}
                        onSort={setMarketSort}
                        align="right"
                      />
                      <SortableHeader
                        label="1D"
                        sortKey="change_1d"
                        sortState={marketSort}
                        onSort={setMarketSort}
                        align="right"
                      />
                      <SortableHeader
                        label="1D %"
                        sortKey="change_pct_1d"
                        sortState={marketSort}
                        onSort={setMarketSort}
                        align="right"
                      />
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                        Actualizado
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedMarket.map((row, i) => (
                      <tr
                        key={`${row.ticker}-${i}`}
                        className="border-t border-slate-800/80 transition-colors hover:bg-slate-800/20"
                      >
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-white">
                              {row.ticker}
                            </span>

                            {row.is_cedear && (
                              <div className="mt-1 flex items-center gap-2">
                                <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                  {row.underlying_ticker || "-"}
                                </span>
                                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                                  {row.ratio_text || "-"}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-300">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.is_cedear
                                ? "bg-indigo-500/15 text-indigo-300"
                                : "bg-slate-800 text-slate-300"
                              }`}
                          >
                            {row.is_cedear ? "CEDEAR" : "Normal"}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-right tabular-nums text-white">
                          {row.market_price == null
                            ? "-"
                            : formatCurrency(row.market_price, row.currency || "USD")}
                        </td>

                        <td
                          className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(row.change_1d || 0) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                            }`}
                        >
                          {formatCurrency(row.change_1d, row.currency || "USD")}
                        </td>

                        <td
                          className={`px-4 py-4 text-right font-semibold tabular-nums ${Number(row.change_pct_1d || 0) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                            }`}
                        >
                          {formatPercent(row.change_pct_1d)}
                        </td>

                        <td className="px-4 py-4 text-slate-300">
                          {row.as_of_ts && !Number.isNaN(new Date(row.as_of_ts).getTime())
                            ? new Date(row.as_of_ts).toLocaleString("es-AR")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionShell>
          )}

          {activeView === "history" && (
            <SectionShell className="mt-8">
              <h2 className="text-2xl font-semibold text-white">Histórico</h2>
              <p className="mt-2 text-slate-400">
                Próximamente: evolución temporal del portfolio.
              </p>
            </SectionShell>
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
            await loadMovements(selectedAssetMovements);
          }
        }}
      />
    </div>
  );
}
