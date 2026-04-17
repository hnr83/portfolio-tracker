import { useEffect, useMemo, useState } from "react";
import TransactionModal from "./TransactionModal";
import HistoryView from "./components/views/HistoryView";
import MarketView from "./components/views/MarketView";
import TransactionsView from "./components/views/TransactionsView";
import HoldingsView from "./components/views/HoldingsView";
import DashboardView from "./components/views/DashboardView";
import SortableHeader from "./components/shared/SortableHeader";
import SectionShell from "./components/layout/SectionShell";
import FilterToolbar from "./components/layout/FilterToolbar";
import SummaryCard from "./components/shared/SummaryCard";
import Sidebar from "./components/layout/Sidebar";
import KpiVisibilityRail from "./components/layout/KpiVisibilityRail";

import {
  formatCurrency,
  formatPercent,
  formatPortfolioPercent,
  formatNumber,
} from "./utils/formatters";

import { sortRows, toggleSort } from "./utils/sort";

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
            <DashboardView
              summary={summary}
              showKpis={showKpis}
              refreshError={refreshError}
              isRefreshing={isRefreshing}
              refreshMarketData={refreshMarketData}
              setIsTransactionModalOpen={setIsTransactionModalOpen}
              handleToggleKpis={handleToggleKpis}
              handlePinKpisToggle={handlePinKpisToggle}
              pinKpis={pinKpis}
              loadHoldings={loadHoldings}
              loadMovements={loadMovements}
              selectedAssetMovements={selectedAssetMovements}
              activeView={activeView}
              loadMarket={loadMarket}
              KpiVisibilityRail={KpiVisibilityRail}
              SectionShell={SectionShell}
              SummaryCard={SummaryCard}
              FilterToolbar={FilterToolbar}
              SortableHeader={SortableHeader}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatPortfolioPercent={formatPortfolioPercent}
              formatNumber={formatNumber}
              chartData={chartData}
              compositionData={compositionData}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              selectedTicker={selectedTicker}
              setSelectedTicker={setSelectedTicker}
              filteredAndSortedInvestments={filteredAndSortedInvestments}
              filteredInvestments={filteredInvestments}
              investmentSearch={investmentSearch}
              setInvestmentSearch={setInvestmentSearch}
              investmentCategoryFilter={investmentCategoryFilter}
              setInvestmentCategoryFilter={setInvestmentCategoryFilter}
              investmentSort={investmentSort}
              setInvestmentSort={setInvestmentSort}
              openAssetTransactions={openAssetTransactions}
              summaryTotalMarketUsd={summary?.total_market_usd}
              totalPortfolioUsd={totalPortfolioUsd}
              investmentsUsd={investmentsUsd}
              liquidityUsd={liquidityUsd}
              cryptoUsd={cryptoUsd}
              compositionTopCount={compositionTopCount}
            />
          )}

          {activeView === "transactions" && (
            <TransactionsView
              selectedAssetMovements={selectedAssetMovements}
              setSelectedAssetMovements={setSelectedAssetMovements}
              loadMovements={loadMovements}
              filteredAndSortedMovements={filteredAndSortedMovements}
              movementSearch={movementSearch}
              setMovementSearch={setMovementSearch}
              movementCategoryFilter={movementCategoryFilter}
              setMovementCategoryFilter={setMovementCategoryFilter}
              movementSort={movementSort}
              setMovementSort={setMovementSort}
              formatNumber={formatNumber}
              formatCurrency={formatCurrency}
              SortableHeader={SortableHeader}
              FilterToolbar={FilterToolbar}
              SectionShell={SectionShell}
            />
          )}

          {activeView === "holdings" && (
            <HoldingsView
              holdings={holdings}
              formatNumber={formatNumber}
              formatCurrency={formatCurrency}
              SectionShell={SectionShell}
            />
          )}

          {activeView === "market" && (
            <MarketView
              marketSearch={marketSearch}
              setMarketSearch={setMarketSearch}
              marketTypeFilter={marketTypeFilter}
              setMarketTypeFilter={setMarketTypeFilter}
              marketSort={marketSort}
              setMarketSort={setMarketSort}
              filteredAndSortedMarket={filteredAndSortedMarket}
              marketTopStats={marketTopStats}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              SortableHeader={SortableHeader}
              FilterToolbar={FilterToolbar}
              SectionShell={SectionShell}
            />
          )}

          {activeView === "history" && <HistoryView />}
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
