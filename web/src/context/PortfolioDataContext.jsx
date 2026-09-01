import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const [investments, setInvestments] = useState([]);
  const [platformAllocation, setPlatformAllocation] = useState([]);
  const resourceCacheRef = useRef(new Map());

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
    setInvestments([]);
    setPlatformAllocation([]);
    resourceCacheRef.current.clear();
  }, []);

  const fetchCached = useCallback(async (key, loader, { ttlMs = 5 * 60 * 1000, force = false } = {}) => {
    const existing = resourceCacheRef.current.get(key);
    const isFresh = existing?.data !== undefined && Date.now() - existing.fetchedAt < ttlMs;
    if (!force && isFresh) return existing.data;
    if (!force && existing?.promise) return existing.promise;

    const promise = Promise.resolve()
      .then(loader)
      .then((data) => {
        resourceCacheRef.current.set(key, { data, fetchedAt: Date.now(), promise: null });
        return data;
      })
      .catch((error) => {
        if (existing?.data !== undefined) {
          resourceCacheRef.current.set(key, { ...existing, promise: null });
        } else {
          resourceCacheRef.current.delete(key);
        }
        throw error;
      });

    resourceCacheRef.current.set(key, { data: existing?.data, fetchedAt: existing?.fetchedAt || 0, promise });
    return promise;
  }, []);

  const getCached = useCallback((key) => resourceCacheRef.current.get(key)?.data, []);
  const invalidateCache = useCallback((prefix = "") => {
    for (const key of resourceCacheRef.current.keys()) {
      if (!prefix || key.startsWith(prefix)) resourceCacheRef.current.delete(key);
    }
  }, []);

  const refreshAll = useCallback(async ({ silent = false } = {}) => {
    const token = window.localStorage.getItem("portfolio-auth-token");

    if (!token) {
      clearData();
      setLoading(false);
      setError("");
      return;
    }

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const [
        summaryRes,
        positionsRes,
        holdingsRes,
        movementsRes,
        marketRes,
        tradingSummaryRes,
        investmentsRes,
        platformAllocationRes,
      ] = await Promise.all([
        apiFetch("/api/portfolio/summary"),
        apiFetch("/api/portfolio/positions"),
        apiFetch("/api/portfolio/holdings"),
        apiFetch("/api/portfolio/movements"),
        apiFetch("/api/portfolio/market"),
        apiFetch("/api/trading/summary"),
        apiFetch("/api/portfolio/investments"),
        apiFetch("/api/portfolio/platform-allocation"),
      ]);

      if (
        summaryRes.status === 401 ||
        positionsRes.status === 401 ||
        holdingsRes.status === 401 ||
        movementsRes.status === 401 ||
        marketRes.status === 401 ||
        tradingSummaryRes.status === 401 ||
        investmentsRes.status === 401 ||
        platformAllocationRes.status === 401
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
        !tradingSummaryRes.ok ||
        !investmentsRes.ok ||
        !platformAllocationRes.ok
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
        investmentsData,
        platformAllocationData,
      ] = await Promise.all([
        summaryRes.json(),
        positionsRes.json(),
        holdingsRes.json(),
        movementsRes.json(),
        marketRes.json(),
        tradingSummaryRes.json(),
        investmentsRes.json(),
        platformAllocationRes.json(),
      ]);

      setSummary(summaryData || null);
      setPositions(Array.isArray(positionsData) ? positionsData : []);
      setHoldings(Array.isArray(holdingsData) ? holdingsData : []);
      setMovements(Array.isArray(movementsData) ? movementsData : []);
      setMarketData(Array.isArray(marketDataResult) ? marketDataResult : []);
      setTradingSummary(tradingSummaryData || null);
      setInvestments(Array.isArray(investmentsData) ? investmentsData : []);
      setPlatformAllocation(Array.isArray(platformAllocationData) ? platformAllocationData : []);

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error loading portfolio data:", err);
      if (!silent) setError(err?.message || "Error cargando datos del portfolio");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [clearData]);

  const refreshPrices = useCallback(async ({ silent = true } = {}) => {
    const token = window.localStorage.getItem("portfolio-auth-token");
    if (!token) return;
    if (!silent) { setLoading(true); setError(""); }

    try {
      const [summaryRes, positionsRes, holdingsRes, marketRes, investmentsRes] = await Promise.all([
        apiFetch("/api/portfolio/summary"),
        apiFetch("/api/portfolio/positions"),
        apiFetch("/api/portfolio/holdings"),
        apiFetch("/api/portfolio/market"),
        apiFetch("/api/portfolio/investments"),
      ]);
      if (![summaryRes, positionsRes, holdingsRes, marketRes, investmentsRes].every((response) => response.ok)) {
        throw new Error("Error actualizando cotizaciones del portfolio");
      }
      const [summaryData, positionsData, holdingsData, marketDataResult, investmentsData] = await Promise.all([
        summaryRes.json(), positionsRes.json(), holdingsRes.json(), marketRes.json(), investmentsRes.json(),
      ]);
      setSummary(summaryData || null);
      setPositions(Array.isArray(positionsData) ? positionsData : []);
      setHoldings(Array.isArray(holdingsData) ? holdingsData : []);
      setMarketData(Array.isArray(marketDataResult) ? marketDataResult : []);
      setInvestments(Array.isArray(investmentsData) ? investmentsData : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error refreshing portfolio prices:", err);
      if (!silent) setError(err?.message || "Error actualizando cotizaciones");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({
      summary,
      positions,
      holdings,
      investments,
      platformAllocation,
      movements,
      marketData,
      tradingSummary,
      loading,
      error,
      lastUpdated,
      refreshAll,
      refreshPrices,
      fetchCached,
      getCached,
      invalidateCache,
      clearData,
    }),
    [
      summary,
      positions,
      holdings,
      investments,
      platformAllocation,
      movements,
      marketData,
      tradingSummary,
      loading,
      error,
      lastUpdated,
      refreshAll,
      refreshPrices,
      fetchCached,
      getCached,
      invalidateCache,
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
