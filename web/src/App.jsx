import { useEffect, useMemo, useState } from "react";
import TransactionModal from "./TransactionModal";
import HistoryView from "./components/views/HistoryView";
import MarketView from "./components/views/MarketView";
import TransactionsView from "./components/views/TransactionsView";
import HoldingsView from "./components/views/HoldingsView";
import DashboardView from "./components/views/DashboardView";
import TradingView from "./components/views/TradingView";
import DecisionMaker from "./components/views/DecisionMaker";
import SortableHeader from "./components/shared/SortableHeader";
import SectionShell from "./components/layout/SectionShell";
import FilterToolbar from "./components/layout/FilterToolbar";
import SummaryCard from "./components/shared/SummaryCard";
import Sidebar from "./components/layout/Sidebar";
import KpiVisibilityRail from "./components/layout/KpiVisibilityRail";
import PerformanceView from "./components/views/PerformanceView.jsx";
import LoginView from "./components/auth/LoginView";
import {
  PortfolioDataProvider,
  usePortfolioData,
} from "./context/PortfolioDataContext";
import { apiFetch } from "./utils/api";

import {
  formatCurrency,
  formatPercent,
  formatPortfolioPercent,
  formatNumber,
} from "./utils/formatters";

import { sortRows } from "./utils/sort";

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

function AppContent() {
  const {
    summary,
    positions,
    movements,
    marketData,
    refreshAll,
    error,
    clearData,
  } = usePortfolioData();

  const [authToken, setAuthToken] = useState(() =>
    window.localStorage.getItem("portfolio-auth-token")
  );

  const [authUser, setAuthUser] = useState(() => {
    try {
      const saved = window.localStorage.getItem("portfolio-auth-user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  function handleLogin(user, token) {
    window.localStorage.setItem("portfolio-auth-token", token);
    window.localStorage.setItem("portfolio-auth-user", JSON.stringify(user));

    setAuthUser(user);
    setAuthToken(token);
  }

  function handleLogout() {
    window.localStorage.removeItem("portfolio-auth-token");
    window.localStorage.removeItem("portfolio-auth-user");
    clearData();
    setAuthUser(null);
    setAuthToken(null);

  }

  useEffect(() => {
    if (error === "SESSION_EXPIRED") {
      clearData();
      handleLogout();
    }
  }, [error, clearData]);

  const [selectedAssetMovements, setSelectedAssetMovements] = useState(null);
  const [assetMovements, setAssetMovements] = useState([]);
  const [assetMovementsLoading, setAssetMovementsLoading] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);

  const [investments, setInvestments] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [showKpis, setShowKpis] = useState(true);
  const [pinKpis, setPinKpis] = useState(false);

  const [platformAllocation, setPlatformAllocation] = useState([]);
  const [compositionMetric, setCompositionMetric] = useState("market_value_usd");

  const [investmentSearch, setInvestmentSearch] = useState("");
  const [investmentCategoryFilter, setInvestmentCategoryFilter] =
    useState("ALL");
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

  const [marketSearch, setMarketSearch] = useState("");
  const [marketTypeFilter, setMarketTypeFilter] = useState("ALL");
  const [marketSort, setMarketSort] = useState({
    key: "change_pct_1d",
    direction: "desc",
  });


  async function loadAssetMovements(asset) {
    if (!asset) {
      setAssetMovements([]);
      return;
    }

    try {
      setAssetMovementsLoading(true);

      const response = await apiFetch(
        `/api/portfolio/movements?asset=${encodeURIComponent(asset)}`
      );

      if (!response.ok) {
        throw new Error(
          `Error loading movements for ${asset} (${response.status})`
        );
      }

      const data = await response.json();

      setAssetMovements(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading asset movements:", error);
      setAssetMovements([]);
    } finally {
      setAssetMovementsLoading(false);
    }
  }

  async function loadDashboardExtraData() {
    try {
      const [investmentsRes, platformAllocationRes] = await Promise.all([
        apiFetch("/api/portfolio/investments"),
        apiFetch("/api/portfolio/platform-allocation"),
      ]);

      if (!investmentsRes.ok) {
        throw new Error(`Investments HTTP ${investmentsRes.status}`);
      }

      if (!platformAllocationRes.ok) {
        throw new Error(
          `Platform allocation HTTP ${platformAllocationRes.status}`
        );
      }

      const [investmentsData, platformAllocationData] = await Promise.all([
        investmentsRes.json(),
        platformAllocationRes.json(),
      ]);

      setInvestments(Array.isArray(investmentsData) ? investmentsData : []);
      setPlatformAllocation(
        Array.isArray(platformAllocationData) ? platformAllocationData : []
      );
    } catch (err) {
      console.error("Error loading dashboard extra data:", err);
    }
  }

  useEffect(() => {
    if (!authToken) return;

    refreshAll();
    loadDashboardExtraData();
  }, [authToken, refreshAll]);

  async function refreshMarketData() {
    try {
      setIsRefreshing(true);
      setRefreshError("");

      const fxRes = await apiFetch("/api/jobs/update-fx", {
        method: "POST",
      });

      if (!fxRes.ok) {
        throw new Error(`update-fx HTTP ${fxRes.status}`);
      }

      const pricesRes = await apiFetch("/api/jobs/update-prices", {
        method: "POST",
      });

      if (!pricesRes.ok) {
        throw new Error(`update-prices HTTP ${pricesRes.status}`);
      }

      const benchmarkPricesRes = await apiFetch(
        "/api/jobs/update-benchmark-prices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes: ["SPY"] }),
        }
      );

      if (!benchmarkPricesRes.ok) {
        throw new Error(
          `update-benchmark-prices HTTP ${benchmarkPricesRes.status}`
        );
      }

      const snapshotRes = await apiFetch("/api/jobs/snapshot-portfolio", {
        method: "POST",
      });

      if (!snapshotRes.ok) {
        throw new Error(`snapshot-portfolio HTTP ${snapshotRes.status}`);
      }

      await refreshAll();
      await loadDashboardExtraData();
    } catch (err) {
      console.error("Error refreshing market data:", err);
      setRefreshError(err.message || "Error actualizando datos");
    } finally {
      setIsRefreshing(false);
    }
  }

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


  useEffect(() => {
    if (!selectedAssetMovements?.ticker) {
      setAssetMovements([]);
      return;
    }

    loadAssetMovements(selectedAssetMovements.ticker);
  }, [selectedAssetMovements]);

  const visibleMovements = useMemo(() => {
    if (selectedAssetMovements?.ticker) {
      return assetMovements || [];
    }

    return movements || [];
  }, [
    movements,
    assetMovements,
    selectedAssetMovements,
  ]);

  const filteredAndSortedMovements = useMemo(() => {
    return sortRows(
      visibleMovements.filter((m) => {
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
  }, [
    visibleMovements,
    movementSearch,
    movementCategoryFilter,
    movementSort,
  ]);

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

  const liquidityUsd = (positions || [])
    .filter((p) => ["CASH", "FX"].includes(p.category))
    .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);

  const cryptoUsd = (positions || [])
    .filter((p) => p.category === "CRYPTO")
    .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);

  const investmentsUsd = (positions || [])
    .filter((p) => p.category === "PORTFOLIO")
    .reduce((acc, p) => acc + Number(p.market_value_usd || 0), 0);

  const totalPortfolioUsd = liquidityUsd + cryptoUsd + investmentsUsd;

  const metricConfig = {
    market_value_usd: {
      label: "Valor actual",
      type: "asset",
    },
    cost_value_usd: {
      label: "Costo",
      type: "asset",
    },
    platform: {
      label: "Plataforma",
      type: "platform",
    },
  };

  const chartData =
    compositionMetric === "platform"
      ? platformAllocation
        .filter((row) => Number(row.invested_usd || 0) > 0)
        .map((row) => ({
          name: row.broker,
          value: Number(row.invested_usd || 0),
        }))
      : filteredAndSortedInvestments
        .filter((inv) => Number(inv[compositionMetric] || 0) > 0)
        .map((inv) => ({
          name: inv.normalized_ticker || inv.ticker,
          value: Number(inv[compositionMetric] || 0),
        }));

  const filteredInvestments = filteredAndSortedInvestments;

  const compositionTopCount = 5;
  const compositionBase = chartData.slice(0, compositionTopCount);
  const compositionOthersValue = chartData
    .slice(compositionTopCount)
    .reduce((acc, item) => acc + Number(item.value || 0), 0);

  const compositionData =
    compositionOthersValue > 0
      ? [
        ...compositionBase,
        {
          name: "Otros",
          value: compositionOthersValue,
        },
      ]
      : compositionBase;

  const activeItem = activeIndex != null ? compositionData[activeIndex] : null;

  const chartTotalValue = chartData.reduce(
    (acc, item) => acc + Number(item.value || 0),
    0
  );

  function handleToggleKpis() {
    if (pinKpis) return;
    setShowKpis((prev) => !prev);
  }

  function handlePinKpisToggle() {
    setPinKpis((prev) => !prev);
  }

  if (!authToken) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#020617]">
      <Sidebar
        summary={summary}
        activeView={activeView}
        setActiveView={setActiveView}
        setSelectedAssetMovements={setSelectedAssetMovements}
        authUser={authUser}
        onLogout={handleLogout}
      />

      <main className="min-h-screen min-w-0 bg-[radial-gradient(circle_at_top_left,rgba(78,99,255,0.16),transparent_22%),radial-gradient(circle_at_top_right,rgba(23,183,229,0.10),transparent_20%),linear-gradient(180deg,#030817_0%,#020617_100%)] xl:pl-72 2xl:pl-80">
        <div className="mx-auto w-full max-w-[1500px] px-3 pb-28 pt-3 text-[13px] sm:px-4 sm:py-4 lg:px-5 xl:px-6 xl:pb-5 xl:pt-4 2xl:max-w-[1720px] 2xl:px-8 2xl:text-[15px]">
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
              selectedAssetMovements={selectedAssetMovements}
              activeView={activeView}
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
              openAssetTransactions={(holdingOrTicker) => {
                const holding =
                  typeof holdingOrTicker === "string"
                    ? { ticker: holdingOrTicker, normalized_ticker: null }
                    : holdingOrTicker;

                setSelectedAssetMovements({
                  ticker: holding.ticker,
                  normalized_ticker: holding.normalized_ticker || null,
                });

                setActiveView("transactions");
              }}
              summaryTotalMarketUsd={summary?.total_market_usd}
              totalPortfolioUsd={totalPortfolioUsd}
              investmentsUsd={investmentsUsd}
              liquidityUsd={liquidityUsd}
              cryptoUsd={cryptoUsd}
              compositionTopCount={compositionTopCount}
              compositionMetric={compositionMetric}
              setCompositionMetric={setCompositionMetric}
              chartTotalValue={chartTotalValue}
            />
          )}

          {activeView === "holdings" && (
            <HoldingsView
              formatNumber={formatNumber}
              formatCurrency={formatCurrency}
              SectionShell={SectionShell}
              onSelectHolding={(holding) => {
                setSelectedAssetMovements({
                  ticker: holding.ticker,
                  normalized_ticker: holding.normalized_ticker,
                });

                setActiveView("transactions");
              }}
            />
          )}

          {activeView === "transactions" && (
            <TransactionsView
              selectedAssetMovements={selectedAssetMovements}
              setSelectedAssetMovements={setSelectedAssetMovements}
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
              marketData={marketData}
            />
          )}

          {activeView === "performance" && <PerformanceView />}

          {activeView === "market" && (
            <MarketView
              marketSearch={marketSearch}
              setMarketSearch={setMarketSearch}
              marketTypeFilter={marketTypeFilter}
              setMarketTypeFilter={setMarketTypeFilter}
              marketSort={marketSort}
              setMarketSort={setMarketSort}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              SortableHeader={SortableHeader}
              FilterToolbar={FilterToolbar}
              SectionShell={SectionShell}
            />
          )}

          {activeView === "history" && <HistoryView />}
          {activeView === "trading" && <TradingView />}
          {activeView === "decision-maker" && <DecisionMaker />}
        </div>
      </main>

      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        onSaved={async () => {
          await refreshAll();
          await loadDashboardExtraData();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <PortfolioDataProvider>
      <AppContent />
    </PortfolioDataProvider>
  );
}