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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        summaryRes,
        positionsRes,
        movementsRes,
        marketRes,
        tradingSummaryRes,
      ] = await Promise.all([
        apiFetch("/api/portfolio/summary"),
        apiFetch("/api/portfolio/positions"),
        apiFetch("/api/portfolio/movements"),
        apiFetch("/api/portfolio/market"),
        apiFetch("/api/trading/summary"),
      ]);

      if (
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
        movementsData,
        marketDataResult,
        tradingSummaryData,
      ] = await Promise.all([
        summaryRes.json(),
        positionsRes.json(),
        movementsRes.json(),
        marketRes.json(),
        tradingSummaryRes.json(),
      ]);


      setSummary(summaryData || null);
      setPositions(Array.isArray(positionsData) ? positionsData : []);
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
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({
      summary,
      positions,
      movements,
      marketData,
      tradingSummary,
      loading,
      error,
      lastUpdated,
      refreshAll,
    }),
    [
      summary,
      positions,
      movements,
      marketData,
      tradingSummary,
      loading,
      error,
      lastUpdated,
      refreshAll,
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