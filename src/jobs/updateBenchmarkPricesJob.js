const axios = require("axios");
const { runQuery } = require("../repositories/bigqueryRepository");
const { table } = require('../utils/bigqueryHelper');

const BENCHMARKS = [
  {
    code: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    asset_type: "ETF",
    provider: "TWELVE_DATA",
    provider_symbol: "SPY",
  },
  {
    code: "QQQ",
    name: "Invesco QQQ Trust",
    asset_type: "ETF",
    provider: "TWELVE_DATA",
    provider_symbol: "QQQ",
  },
  {
    code: "BTC",
    name: "Bitcoin",
    asset_type: "CRYPTO",
    provider: "COINGECKO",
    provider_symbol: "bitcoin",
  },
];

function getSelectedBenchmarks(codes = []) {
  console.log("getSelectedBenchmarks INPUT:", codes, Array.isArray(codes));

  const safeCodes = Array.isArray(codes)
    ? codes
    : typeof codes === "string" && codes.trim()
      ? [codes]
      : [];

  console.log("safeCodes:", safeCodes, Array.isArray(safeCodes));

  if (safeCodes.length === 0) {
    return BENCHMARKS.filter((b) => b.code === "SPY");
  }

  const normalized = safeCodes.map((c) => String(c).trim().toUpperCase());

  console.log("normalized:", normalized, Array.isArray(normalized));

  return BENCHMARKS.filter((b) =>
    normalized.includes(String(b.code).trim().toUpperCase())
  );
}

async function fetchTwelveDataPrice(benchmark) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing TWELVE_DATA_API_KEY");
  }

  const response = await axios.get("https://api.twelvedata.com/price", {
    params: {
      symbol: benchmark.provider_symbol,
      apikey: apiKey,
    },
  });

  if (response.data?.status === "error") {
    throw new Error(
      `Twelve Data error for ${benchmark.code}: ${response.data.message || "unknown error"}`
    );
  }

  const price = Number(response.data?.price);

  if (!Number.isFinite(price)) {
    throw new Error(`Invalid Twelve Data price for ${benchmark.code}`);
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    close_price_usd: price,
    source: "TWELVE_DATA",
  };
}

async function fetchTwelveDataHistory(benchmark, outputsize = 365) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing TWELVE_DATA_API_KEY");
  }

  const response = await axios.get("https://api.twelvedata.com/time_series", {
    params: {
      symbol: benchmark.provider_symbol,
      interval: "1day",
      outputsize,
      order: "ASC",
      apikey: apiKey,
    },
  });

  if (response.data?.status === "error") {
    throw new Error(
      `Twelve Data history error for ${benchmark.code}: ${response.data.message || "unknown error"}`
    );
  }

  const values = Array.isArray(response.data?.values) ? response.data.values : [];

  if (values.length === 0) {
    throw new Error(`No history returned for ${benchmark.code}`);
  }

  return values
    .map((item) => ({
      date: item.datetime,
      close_price_usd: Number(item.close),
      source: "TWELVE_DATA",
    }))
    .filter((item) => item.date && Number.isFinite(item.close_price_usd));
}

async function fetchCoinGeckoPrice(benchmark) {
  const headers = {};
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const response = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
    params: {
      ids: benchmark.provider_symbol,
      vs_currencies: "usd",
    },
    headers,
  });

  const price = Number(response.data?.[benchmark.provider_symbol]?.usd);

  if (!Number.isFinite(price)) {
    throw new Error(`Invalid CoinGecko price for ${benchmark.code}`);
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    close_price_usd: price,
    source: "COINGECKO",
  };
}

async function fetchBenchmarkPrice(benchmark) {
  if (benchmark.provider === "TWELVE_DATA") {
    return fetchTwelveDataPrice(benchmark);
  }

  if (benchmark.provider === "COINGECKO") {
    return fetchCoinGeckoPrice(benchmark);
  }

  throw new Error(`Unsupported provider for ${benchmark.code}: ${benchmark.provider}`);
}

async function fetchBenchmarkHistory(benchmark, outputsize = 365) {
  if (benchmark.provider === "TWELVE_DATA") {
    return fetchTwelveDataHistory(benchmark, outputsize);
  }

  throw new Error(`Historical fetch not implemented for ${benchmark.code}`);
}

async function upsertBenchmarkPrice(row) {
  const safeName = String(row.benchmark_name || "").replace(/'/g, "\\'");
  const safeAssetType = String(row.asset_type || "").replace(/'/g, "\\'");
  const safeSource = String(row.source || "").replace(/'/g, "\\'");
  const safeCode = String(row.benchmark_code || "").replace(/'/g, "\\'");

  const query = `
    MERGE ${table('benchmark_prices')} T
    USING (
      SELECT
        DATE('${row.date}') AS date,
        '${safeCode}' AS benchmark_code,
        '${safeName}' AS benchmark_name,
        '${safeAssetType}' AS asset_type,
        ${row.close_price_usd} AS close_price_usd,
        '${safeSource}' AS source
    ) S
    ON T.date = S.date
    AND T.benchmark_code = S.benchmark_code
    WHEN MATCHED THEN
      UPDATE SET
        benchmark_name = S.benchmark_name,
        asset_type = S.asset_type,
        close_price_usd = S.close_price_usd,
        source = S.source,
        created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
      INSERT (
        date,
        benchmark_code,
        benchmark_name,
        asset_type,
        close_price_usd,
        source,
        created_at
      )
      VALUES (
        S.date,
        S.benchmark_code,
        S.benchmark_name,
        S.asset_type,
        S.close_price_usd,
        S.source,
        CURRENT_TIMESTAMP()
      )
  `;

  await runQuery(query);
}

async function updateBenchmarkPricesJob(selectedCodes = []) {
  const benchmarks = getSelectedBenchmarks(selectedCodes);
  const results = [];

  for (const benchmark of benchmarks) {
    try {
      const priceData = await fetchBenchmarkPrice(benchmark);

      const row = {
        benchmark_code: benchmark.code,
        benchmark_name: benchmark.name,
        asset_type: benchmark.asset_type,
        date: priceData.date,
        close_price_usd: priceData.close_price_usd,
        source: priceData.source,
      };

      await upsertBenchmarkPrice(row);

      results.push({
        benchmark_code: benchmark.code,
        ok: true,
        date: row.date,
        close_price_usd: row.close_price_usd,
        source: row.source,
      });
    } catch (error) {
      console.error(`Error updating benchmark ${benchmark.code}:`, error.message);

      results.push({
        benchmark_code: benchmark.code,
        ok: false,
        error: error.message,
      });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  };
}

async function backfillBenchmarkHistoryJob(selectedCodes = [], outputsize = 365) {
  const benchmarks = getSelectedBenchmarks(selectedCodes);
  const results = [];
  console.log("selectedCodes:", selectedCodes, Array.isArray(selectedCodes));
  console.log("benchmarks seleccionados:", benchmarks);

  for (const benchmark of benchmarks) {
    try {
      console.log(`Fetching history for ${benchmark.code} with outputsize=${outputsize}...`);

      const historyRows = await fetchBenchmarkHistory(benchmark, outputsize);

      console.log(`History received for ${benchmark.code}: ${historyRows.length} rows`);

      let index = 0;
      for (const item of historyRows) {
        index += 1;
        console.log(`Upserting ${benchmark.code} ${index}/${historyRows.length} - ${item.date}`);

        await upsertBenchmarkPrice({
          benchmark_code: benchmark.code,
          benchmark_name: benchmark.name,
          asset_type: benchmark.asset_type,
          date: item.date,
          close_price_usd: item.close_price_usd,
          source: item.source,
        });
      }

      results.push({
        benchmark_code: benchmark.code,
        ok: true,
        rows_upserted: historyRows.length,
        from: historyRows[0]?.date || null,
        to: historyRows[historyRows.length - 1]?.date || null,
      });
    } catch (error) {
      console.error(`Error backfilling benchmark ${benchmark.code}:`, error.message);

      results.push({
        benchmark_code: benchmark.code,
        ok: false,
        error: error.message,
      });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  };
}

module.exports = {
  updateBenchmarkPricesJob,
  backfillBenchmarkHistoryJob,
};