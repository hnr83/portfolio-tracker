const { runQuery } = require('../services/bigQueryService');
const { table } = require('../utils/bigqueryHelper');

function isBigQueryNumericObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    's' in value &&
    'e' in value &&
    'c' in value &&
    Array.isArray(value.c)
  );
}

function bigQueryNumericObjectToString(value) {
  const sign = value.s === -1 ? '-' : '';
  const digits = value.c.join('');
  const exponent = Number(value.e);

  if (!digits) return '0';

  if (exponent < 0) {
    const zeros = Math.abs(exponent) - 1;
    return `${sign}0.${'0'.repeat(zeros)}${digits}`;
  }

  const decimalPos = exponent + 1;

  if (digits.length <= decimalPos) {
    return `${sign}${digits}${'0'.repeat(decimalPos - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`;
}

function unwrapBigQueryValue(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return unwrapBigQueryValue(value.value);
  }

  if (isBigQueryNumericObject(value)) {
    return bigQueryNumericObjectToString(value);
  }

  if (Array.isArray(value)) {
    return value.map(unwrapBigQueryValue);
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, innerValue] of Object.entries(value)) {
      out[key] = unwrapBigQueryValue(innerValue);
    }
    return out;
  }

  return value;
}

function normalizeBigQueryRows(rows = []) {
  return rows.map((row) => unwrapBigQueryValue(row));
}

async function getSummary(req, res) {
  try {

const query = `
  WITH portfolio AS (
    SELECT
      SUM(CAST(market_value_usd AS FLOAT64)) AS total_market_usd,
      SUM(CAST(market_value_ars AS FLOAT64)) AS total_market_ars,

      SUM(CAST(cost_value_usd AS FLOAT64)) AS total_cost_usd,
      SUM(CAST(cost_value_ars AS FLOAT64)) AS total_cost_ars,

      SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(market_value_usd AS FLOAT64) ELSE 0 END)
        AS investments_market_usd,

      SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(market_value_ars AS FLOAT64) ELSE 0 END)
        AS investments_market_ars,

      SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(cost_value_usd AS FLOAT64) ELSE 0 END)
        AS investments_cost_usd,

      SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_usd AS FLOAT64) ELSE 0 END)
        AS total_pnl_usd,

      SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_ars AS FLOAT64) ELSE 0 END)
        AS total_pnl_ars,

      SAFE_DIVIDE(
        SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_usd AS FLOAT64) ELSE 0 END),
        NULLIF(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(cost_value_usd AS FLOAT64) ELSE 0 END), 0)
      ) AS total_pnl_pct,

      -- FX actual
      ANY_VALUE(CAST(usdars AS FLOAT64)) AS usdars

    FROM ${table('vw_portfolio_valued')}
  ),

  trading AS (
    SELECT
      CAST(retained_result_usd AS FLOAT64) AS trading_retained_result_usd
    FROM ${table('vw_trading_summary')}
  )

  SELECT
    p.*,

    COALESCE(t.trading_retained_result_usd, 0) AS trading_retained_result_usd,

    -- Total consolidado USD
    COALESCE(p.total_market_usd, 0)
      + COALESCE(t.trading_retained_result_usd, 0)
      AS total_with_trading_usd,

    -- Total consolidado ARS
    COALESCE(p.total_market_ars, 0)
      + COALESCE(t.trading_retained_result_usd, 0) * COALESCE(p.usdars, 0)
      AS total_with_trading_ars

  FROM portfolio p
  CROSS JOIN trading t
`;

    const rows = await runQuery(query);
    const normalizedRows = normalizeBigQueryRows(rows);

    res.json(normalizedRows[0] || {});
  } catch (error) {
    console.error('Error in getSummary:', error);
    res.status(500).json({ error: 'Error fetching portfolio summary' });
  }
}

async function getHoldings(req, res) {
  try {
    const query = `
      WITH base AS (
        SELECT
          CASE
            WHEN category IN ('CASH', 'FX') THEN normalized_ticker
            ELSE ticker
          END AS ticker,

          CASE
            WHEN category IN ('CASH', 'FX') THEN 'LIQUIDITY'
            ELSE category
          END AS category,

          normalized_ticker,
          CAST(quantity_net AS FLOAT64) AS quantity_net,
          CAST(cost_net AS FLOAT64) AS cost_net,
          CAST(market_price AS FLOAT64) AS market_price,
          price_currency,
          price_source,
          underlying_ticker,
          CAST(ratio_numerator AS FLOAT64) AS ratio_numerator,
          CAST(ratio_denominator AS FLOAT64) AS ratio_denominator,
          CAST(underlying_price_usd AS FLOAT64) AS underlying_price_usd,
          CAST(usdars AS FLOAT64) AS usdars,
          CAST(market_value_usd AS FLOAT64) AS market_value_usd,
          CAST(market_value_ars AS FLOAT64) AS market_value_ars,
          CAST(cost_value_usd AS FLOAT64) AS cost_value_usd,
          CAST(cost_value_ars AS FLOAT64) AS cost_value_ars,
          CAST(pnl_usd AS FLOAT64) AS pnl_usd,
          CAST(pnl_ars AS FLOAT64) AS pnl_ars,
          CAST(pnl_pct AS FLOAT64) AS pnl_pct
        FROM ${table('vw_portfolio_valued')}
        WHERE market_value_usd IS NOT NULL
      ),

      grouped AS (
        SELECT
          ticker,
          category,
          normalized_ticker,

          SUM(quantity_net) AS quantity_net,
          SUM(cost_net) AS cost_net,

          ANY_VALUE(market_price) AS market_price,
          ANY_VALUE(price_currency) AS price_currency,
          ANY_VALUE(price_source) AS price_source,

          ANY_VALUE(underlying_ticker) AS underlying_ticker,
          ANY_VALUE(ratio_numerator) AS ratio_numerator,
          ANY_VALUE(ratio_denominator) AS ratio_denominator,
          ANY_VALUE(underlying_price_usd) AS underlying_price_usd,
          ANY_VALUE(usdars) AS usdars,

          SUM(market_value_usd) AS market_value_usd,
          SUM(market_value_ars) AS market_value_ars,
          SUM(cost_value_usd) AS cost_value_usd,
          SUM(cost_value_ars) AS cost_value_ars,
          SUM(pnl_usd) AS pnl_usd,
          SUM(pnl_ars) AS pnl_ars,

          SAFE_DIVIDE(SUM(pnl_usd), NULLIF(SUM(cost_value_usd), 0)) AS pnl_pct,

          CASE
            WHEN category = 'PORTFOLIO'
            THEN SAFE_DIVIDE(SUM(cost_value_usd), NULLIF(SUM(quantity_net), 0))
            ELSE NULL
          END AS avg_cost_price_usd,

          CASE
            WHEN category = 'PORTFOLIO'
                 AND ANY_VALUE(underlying_ticker) IS NOT NULL
                 AND ANY_VALUE(ratio_numerator) IS NOT NULL
                 AND ANY_VALUE(ratio_denominator) IS NOT NULL
                 AND ANY_VALUE(ratio_denominator) != 0
            THEN SAFE_DIVIDE(SUM(cost_value_usd), NULLIF(SUM(quantity_net), 0))
                 * SAFE_DIVIDE(ANY_VALUE(ratio_numerator), ANY_VALUE(ratio_denominator))
            ELSE NULL
          END AS avg_cost_underlying_usd,

          CASE
            WHEN category = 'LIQUIDITY'
            THEN SAFE_DIVIDE(SUM(cost_value_ars), NULLIF(SUM(cost_value_usd), 0))
            ELSE NULL
          END AS fx_rate_avg,

          NULL AS change_pct_1d
        FROM base
        GROUP BY ticker, category, normalized_ticker
      )

      SELECT
        ticker,
        category,
        normalized_ticker,
        quantity_net,
        cost_net,
        market_price,
        price_currency,
        price_source,
        underlying_ticker,
        ratio_numerator,
        ratio_denominator,
        underlying_price_usd,
        usdars,
        market_value_usd,
        market_value_ars,
        cost_value_usd,
        cost_value_ars,
        avg_cost_price_usd,
        avg_cost_underlying_usd,
        fx_rate_avg,

        CASE
          WHEN category = 'PORTFOLIO'
               AND underlying_ticker IS NOT NULL
               AND avg_cost_underlying_usd IS NOT NULL
          THEN avg_cost_underlying_usd
          WHEN category = 'PORTFOLIO'
          THEN avg_cost_price_usd
          WHEN category = 'LIQUIDITY'
          THEN fx_rate_avg
          ELSE NULL
        END AS reference_value,

        CASE
          WHEN category = 'PORTFOLIO'
               AND underlying_ticker IS NOT NULL
               AND avg_cost_underlying_usd IS NOT NULL
          THEN 'PPC Underlying'
          WHEN category = 'PORTFOLIO'
          THEN 'PPC USD'
          WHEN category = 'LIQUIDITY'
          THEN 'TC'
          ELSE NULL
        END AS reference_type,

        pnl_usd,
        pnl_ars,
        pnl_pct,
        change_pct_1d
      FROM grouped
      ORDER BY market_value_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error('Error in getHoldings:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
}

async function getPositions(req, res) {
  try {
    const query = `
      SELECT
        ticker,
        category,
        normalized_ticker,
        quantity_net,
        cost_net,
        market_price,
        price_currency,
        price_source,
        underlying_ticker,
        ratio_numerator,
        ratio_denominator,
        underlying_price_usd,
        usdars,
        market_value_usd,
        market_value_ars,
        cost_value_usd,
        cost_value_ars,
        pnl_usd,
        pnl_ars,
        pnl_pct
      FROM ${table('vw_portfolio_valued')}
      ORDER BY market_value_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error('Error in getPositions:', error);
    res.status(500).json({ error: 'Error fetching positions' });
  }
}

async function getHistory(req, res) {
  try {
    const range = (req.query.range || "6M").toUpperCase();

    let dateFilter = "";
    switch (range) {
      case "1M":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)";
        break;
      case "3M":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)";
        break;
      case "6M":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)";
        break;
      case "YTD":
        dateFilter = "snapshot_date >= DATE_TRUNC(CURRENT_DATE(), YEAR)";
        break;
      case "1A":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR)";
        break;
      case "MAX":
      default:
        dateFilter = "1=1";
        break;
    }

    const query = `
      SELECT
        snapshot_date,
        COALESCE(total_with_trading_usd, market_value_usd) AS market_value_usd,
        market_value_ars,
        cost_value_usd,
        cost_value_ars,
        total_pnl_usd,
        total_pnl_ars,
        total_pnl_pct,
        investments_usd,
        investments_cost_usd,
        investments_cost_ars,
        liquidity_usd,
        crypto_usd
      FROM ${table('portfolio_snapshots')}
      WHERE ${dateFilter}
      ORDER BY snapshot_date ASC
          `;

    const rows = await runQuery(query);

    res.json(rows);
  } catch (error) {
    console.error("Error in getHistory:", error);
    res.status(500).json({ error: "Error fetching history" });
  }
}

async function getInvestments(req, res) {
  try {
    const query = `
      SELECT
        ticker,
        category,
        normalized_ticker,
        quantity_net,
        cost_net,
        market_price,
        price_currency,
        price_source,
        underlying_ticker,
        ratio_numerator,
        ratio_denominator,
        underlying_price_usd,
        usdars,
        market_value_usd,
        market_value_ars,
        cost_value_usd,
        cost_value_ars,
        pnl_usd,
        pnl_ars,
        pnl_pct
      FROM ${table('vw_portfolio_valued')}
      WHERE category NOT IN ('CASH', 'FX', 'CRYPTO')
      ORDER BY market_value_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error('Error in getInvestments:', error);
    res.status(500).json({ error: 'Error fetching investments' });
  }
}

async function getMovements(req, res) {
  try {
    const { asset, category, limit } = req.query;

    const whereClauses = [];
    const params = {};

    if (asset) {
      whereClauses.push(`ticker = @asset`);
      params.asset = asset;
    }

    if (category) {
      whereClauses.push(`category = @category`);
      params.category = category;
    }

    const parsedLimit = Number(limit);

    let safeLimit;
    if (asset) {
      safeLimit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 5000)
          : 5000;
    } else {
      safeLimit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 500)
          : 200;
    }

    const whereSql = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const query = `
      SELECT
        id,
        source_table,
        fecha,
        movement_type,
        category,
        owner,
        ticker,
        instrument_type,
        side,
        quantity,
        unit_price,
        price_currency,
        gross_amount,
        net_amount,
        settlement_currency,
        fx_rate,
        broker,
        description,
        raw_payload
      FROM ${table('movements')}
      ${whereSql}
      ORDER BY fecha DESC
      LIMIT ${safeLimit}
    `;

    const rows = await runQuery(query, params);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getMovements:", error.message);
    console.error(error);
    res.status(500).json({ error: "Error fetching movements" });
  }
}


async function getMarket(req, res) {
  try {
    const query = `
      WITH portfolio_assets AS (
        SELECT DISTINCT
          CASE
            WHEN normalized_ticker IS NOT NULL AND normalized_ticker != '' THEN normalized_ticker
            WHEN STARTS_WITH(ticker, 'CURRENCY:') AND ENDS_WITH(ticker, 'ARS')
              THEN REGEXP_REPLACE(REGEXP_REPLACE(ticker, r'^CURRENCY:', ''), r'ARS$', '')
            ELSE ticker
          END AS market_key
        FROM ${table('vw_portfolio_valued')}
        WHERE quantity_net > 0
          AND market_value_usd IS NOT NULL
      ),
      market_watch AS (
        SELECT
          *,
          ticker AS market_key
        FROM ${table('vw_market_watch')}
      )
      SELECT mw.*
      FROM market_watch mw
      INNER JOIN portfolio_assets pa
        ON mw.market_key = pa.market_key
      WHERE mw.ticker NOT IN ('USDT')
      ORDER BY mw.change_pct_1d DESC, mw.ticker
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error('Error in getMarket:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    res.status(500).json({ error: 'Error fetching market data', details: error?.message });
  }
}

async function getPlatformAllocation(req, res) {
  try {
    const query = `
SELECT
  COALESCE(NULLIF(TRIM(broker), ''), 'Sin broker') AS broker,
  SUM(
    CASE
      WHEN movement_type = 'BUY_ASSET'
        THEN
          CASE
            WHEN settlement_currency = 'USD' THEN CAST(gross_amount AS FLOAT64)
            WHEN settlement_currency = 'ARS' AND fx_rate IS NOT NULL THEN CAST(gross_amount AS FLOAT64) / fx_rate
            ELSE 0
          END
      WHEN movement_type = 'SELL_ASSET'
        THEN
          CASE
            WHEN settlement_currency = 'USD' THEN -CAST(gross_amount AS FLOAT64)
            WHEN settlement_currency = 'ARS' AND fx_rate IS NOT NULL THEN -CAST(gross_amount AS FLOAT64) / fx_rate
            ELSE 0
          END
      ELSE 0
    END
  ) AS invested_usd
FROM ${table('movements')}
WHERE movement_type IN ('BUY_ASSET', 'SELL_ASSET')
GROUP BY 1
HAVING invested_usd > 0
ORDER BY invested_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getPlatformAllocation:", error);
    res.status(500).json({ error: "Error fetching platform allocation" });
  }
}

async function getBenchmarkComparison(req, res) {
  try {

    const range = String(req.query.range || "6M").toUpperCase();

    let dateFilter = "";
    switch (range) {
      case "1M":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)";
        break;
      case "3M":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)";
        break;
      case "6M":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)";
        break;
      case "YTD":
        dateFilter = "snapshot_date >= DATE_TRUNC(CURRENT_DATE(), YEAR)";
        break;
      case "1A":
        dateFilter = "snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR)";
        break;
      case "MAX":
      default:
        dateFilter = "1=1";
        break;
    }

    const requestedCode = String(req.query.code || "SPY").toUpperCase();

    const allowedBenchmarks = ["SPY", "QQQ", "BTC"];
    const benchmarkCode = allowedBenchmarks.includes(requestedCode)
      ? requestedCode
      : "SPY";

    const query = `
      WITH snapshots AS (
        SELECT
          snapshot_date,
          investments_usd
        FROM ${table('portfolio_snapshots')}
        WHERE investments_usd IS NOT NULL
         AND ${dateFilter}
      ),
      benchmark AS (
        SELECT
          date AS snapshot_date,
          benchmark_code,
          close_price_usd
        FROM ${table('benchmark_prices')}
        WHERE benchmark_code = @benchmarkCode
          AND close_price_usd IS NOT NULL
      ),
      joined AS (
        SELECT
          s.snapshot_date,
          s.investments_usd,
          b.benchmark_code,
          b.close_price_usd
        FROM snapshots s
        INNER JOIN benchmark b
          ON s.snapshot_date = b.snapshot_date
      ),
      base AS (
        SELECT
          *,
          FIRST_VALUE(investments_usd) OVER (ORDER BY snapshot_date) AS base_investments_usd,
          FIRST_VALUE(close_price_usd) OVER (ORDER BY snapshot_date) AS base_benchmark_price
        FROM joined
      )
      SELECT
        snapshot_date,
        benchmark_code,
        investments_usd,
        close_price_usd,
        SAFE_DIVIDE(investments_usd, base_investments_usd) * 100 AS investments_index,
        SAFE_DIVIDE(close_price_usd, base_benchmark_price) * 100 AS benchmark_index,
        (SAFE_DIVIDE(investments_usd, base_investments_usd) * 100)
          - (SAFE_DIVIDE(close_price_usd, base_benchmark_price) * 100) AS relative_alpha_index
      FROM base
      ORDER BY snapshot_date
    `;

    const rows = await runQuery(query, { benchmarkCode });

    const normalizedRows = rows.map((row) => ({
      snapshot_date: row.snapshot_date?.value || row.snapshot_date || null,
      benchmark_code: row.benchmark_code,
      investments_usd: Number(row.investments_usd || 0),
      close_price_usd: Number(row.close_price_usd || 0),
      investments_index: Number(row.investments_index || 0),
      benchmark_index: Number(row.benchmark_index || 0),
      relative_alpha_index: Number(row.relative_alpha_index || 0),
    }));

    res.json({
      benchmark_code: benchmarkCode,
      rows: normalizedRows,
    });
  } catch (error) {
    console.error("Error fetching benchmark comparison:", error);
    res.status(500).json({ error: "Error fetching benchmark comparison" });
  }
}



module.exports = {
  getSummary,
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
  getMarket,
  getHistory,
  getPlatformAllocation,
  getBenchmarkComparison,
};