import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiFetch } from "../utils/api";

const PortfolioDataContext = createContext(null);

export function PortfolioDataProvider({ children }) {
  const [summary, setSummary] = useState(null);
  const [positions, setPositions] = useState([]);
  const [movements, setMovements] = useState([]);
  const [marketData, setMarketData] = useState([]);
  const [tradingSummary, setTradingSummary] = useState(null);
  const [holdings, setHoldings] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const clearData = useCallback(() => {
    setSummary(null);
    setPositions([]);
    setMovements([]);
    setMarketData([]);
    setTradingSummary(null);
    setLastUpdated(null);
    setHoldings([]);
  }, []);

  const refreshAll = useCallback(async () => {
    const token = window.localStorage.getItem("portfolio-auth-token");

    if (!token) {
      clearData();
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [
        summaryRes,
        positionsRes,
        holdingsRes,
        movementsRes,
        marketRes,
        tradingSummaryRes,
      ] = await Promise.all([
        apiFetch("/api/portfolio/summary"),
        apiFetch("/api/portfolio/positions"),
        apiFetch("/api/portfolio/holdings"),
        apiFetch("/api/portfolio/movements"),
        apiFetch("/api/portfolio/market"),
        apiFetch("/api/trading/summary"),
      ]);

      if (
        summaryRes.status === 401 ||
        positionsRes.status === 401 ||
        holdingsRes.status === 401 ||
        movementsRes.status === 401 ||
        marketRes.status === 401 ||
        tradingSummaryRes.status === 401
      ) {
        clearData();
        throw new Error("Sesión expirada. Volvé a iniciar sesión.");
      }

      if (
        !holdingsRes.ok ||
        !summaryRes.ok ||
        !positionsRes.ok ||
        !movementsRes.ok ||
        !marketRes.ok ||
        !tradingSummaryRes.ok
      ) {
        throw new Error("Error cargando datos del portfolio");
      }

      const [
        summaryData,
        positionsData,
        holdingsData,
        movementsData,
        marketDataResult,
        tradingSummaryData,
      ] = await Promise.all([
        summaryRes.json(),
        positionsRes.json(),
        holdingsRes.json(),
        movementsRes.json(),
        marketRes.json(),
        tradingSummaryRes.json(),
      ]);

      setSummary(summaryData || null);
      setPositions(Array.isArray(positionsData) ? positionsData : []);
      setHoldings(Array.isArray(holdingsData) ? holdingsData : []);
      setMovements(Array.isArray(movementsData) ? movementsData : []);
      setMarketData(Array.isArray(marketDataResult) ? marketDataResult : []);
      setTradingSummary(tradingSummaryData || null);

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error loading portfolio data:", err);
      setError(err?.message || "Error cargando datos del portfolio");
    } finally {
      setLoading(false);
    }
  }, [clearData]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({
      summary,
      positions,
      holdings,
      movements,
      marketData,
      tradingSummary,
      loading,
      error,
      lastUpdated,
      refreshAll,
      clearData,
    }),
    [
      summary,
      positions,
      holdings,
      movements,
      marketData,
      tradingSummary,
      loading,
      error,
      lastUpdated,
      refreshAll,
      clearData,
    ]
  );

  return (
    <PortfolioDataContext.Provider value={value}>
      {children}
    </PortfolioDataContext.Provider>
  );
}

export function usePortfolioData() {
  const context = useContext(PortfolioDataContext);

  if (!context) {
    throw new Error(
      "usePortfolioData debe usarse dentro de PortfolioDataProvider"
    );
  }

  return context;
}