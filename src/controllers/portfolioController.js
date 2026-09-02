const { runQuery } = require('../services/bigQueryService');
const { table } = require('../utils/bigqueryHelper');
const { buildDecisionMaker } = require("../services/decisionMakerService");
const investmentThesis = require("../config/investmentThesis");
const { getBingxSpotHistoryOrders, getBingxSpotMyTrades, } = require("../services/providers/bingxService");
const crypto = require("crypto");

let custodyTransfersReady;

function ensureCustodyTransfersTable() {
  if (!custodyTransfersReady) {
    custodyTransfersReady = runQuery(`
      CREATE TABLE IF NOT EXISTS ${table('custody_transfers')} (
        id STRING NOT NULL,
        transfer_date DATE NOT NULL,
        ticker STRING NOT NULL,
        owner STRING,
        from_broker STRING NOT NULL,
        to_broker STRING NOT NULL,
        quantity NUMERIC NOT NULL,
        description STRING,
        created_at TIMESTAMP NOT NULL
      )
      PARTITION BY transfer_date
      CLUSTER BY ticker, owner
    `).catch((error) => {
      custodyTransfersReady = null;
      throw error;
    });
  }
  return custodyTransfersReady;
}

function custodyTickerSql(expression) {
  return `CASE
    WHEN UPPER(${expression}) = 'USDT' THEN 'USDT'
    WHEN STARTS_WITH(UPPER(${expression}), 'CURRENCY:') AND ENDS_WITH(UPPER(${expression}), 'ARS')
      THEN REGEXP_REPLACE(REGEXP_REPLACE(UPPER(${expression}), r'^CURRENCY:', ''), r'ARS$', '')
    WHEN STARTS_WITH(UPPER(${expression}), 'CURRENCY:')
      THEN REGEXP_REPLACE(UPPER(${expression}), r'^CURRENCY:', '')
    ELSE UPPER(TRIM(${expression}))
  END`;
}

function custodyBrokerSql(expression) {
  return `CASE
    WHEN ${expression} IS NULL OR TRIM(${expression}) = '' THEN 'Sin plataforma'
    WHEN LOWER(TRIM(${expression})) = 'bingx' THEN 'BingX'
    WHEN LOWER(TRIM(${expression})) = 'binance' THEN 'Binance'
    WHEN LOWER(TRIM(${expression})) = 'ibkr' THEN 'IBKR'
    WHEN LOWER(TRIM(${expression})) = 'etoro' THEN 'eToro'
    WHEN LOWER(TRIM(${expression})) = 'ledger' THEN 'Ledger'
    WHEN LOWER(TRIM(${expression})) = 'ledger 2' THEN 'Ledger 2'
    WHEN LOWER(TRIM(${expression})) = 'ledger flex' THEN 'Ledger Flex'
    WHEN LOWER(TRIM(${expression})) = 'cocos' THEN 'Cocos'
    WHEN LOWER(TRIM(${expression})) = 'cocos vale' THEN 'Cocos Vale'
    WHEN LOWER(TRIM(${expression})) = 'bmb' THEN 'BMB'
    WHEN LOWER(TRIM(${expression})) = 'bmb vale' THEN 'BMB Vale'
    ELSE TRIM(${expression})
  END`;
}


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
    COALESCE(
      SUM(CAST(market_value_usd AS FLOAT64)),
      0
    ) AS trading_retained_result_usd
  FROM ${table('vw_trading_balances_valued')}
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

function assetPeriodStart(period, today = new Date()) {
  const date = new Date(today);
  const days = { "1D": 1, "7D": 7, "30D": 30, "1Y": 365 }[period];
  if (days) date.setUTCDate(date.getUTCDate() - days);
  else if (period === "YTD") date.setUTCMonth(0, 1);
  else return null;
  return date.toISOString().slice(0, 10);
}

function calculateAssetPeriod(series, period) {
  if (!series.length) return { period, pnl_usd: null, pnl_pct: null };
  const startDate = assetPeriodStart(period);
  const eligible = startDate ? series.filter((row) => row.date >= startDate) : series;
  const start = eligible[0] || series[0];
  const end = series[series.length - 1];
  if (!start || start === end) return { period, pnl_usd: 0, pnl_pct: 0 };

  const rows = series.filter((row) => row.date > start.date && row.date <= end.date);
  const netFlow = rows.reduce((sum, row) => sum + Number(row.net_flow_usd || 0), 0);
  const pnl = Number(end.market_value_usd || 0) - Number(start.market_value_usd || 0) - netFlow;

  let twrFactor = 1;
  let previousValue = Number(start.market_value_usd || 0);
  for (const row of rows) {
    if (previousValue > 0) {
      twrFactor *= (Number(row.market_value_usd || 0) - Number(row.net_flow_usd || 0)) / previousValue;
    }
    previousValue = Number(row.market_value_usd || 0);
  }

  return {
    period,
    start_date: start.date,
    end_date: end.date,
    pnl_usd: pnl,
    pnl_pct: Number.isFinite(twrFactor) ? (twrFactor - 1) * 100 : null,
  };
}

async function getAssetDetail(req, res) {
  try {
    const ticker = decodeURIComponent(String(req.params.ticker || "")).trim();
    if (!ticker) return res.status(400).json({ error: "Ticker is required" });

    const currentQuery = `
      SELECT
        ticker, normalized_ticker, category, quantity_net, market_price,
        price_currency, underlying_ticker, ratio_numerator, ratio_denominator,
        market_value_usd, cost_value_usd, pnl_usd, pnl_pct,
        (
          SELECT MIN(m.fecha)
          FROM ${table('movements')} m
          WHERE m.ticker = vp.ticker OR m.ticker = vp.normalized_ticker
        ) AS first_position_date,
        SAFE_DIVIDE(
          market_value_usd,
          (SELECT SUM(CAST(market_value_usd AS FLOAT64)) FROM ${table('vw_portfolio_valued')})
        ) * 100 AS current_weight_pct
      FROM ${table('vw_portfolio_valued')} vp
      WHERE vp.ticker = @ticker OR vp.normalized_ticker = @ticker
      ORDER BY market_value_usd DESC
      LIMIT 1
    `;

    const seriesQuery = `
      WITH asset AS (
        SELECT
          ticker,
          normalized_ticker,
          category,
          underlying_ticker,
          CAST(ratio_numerator AS FLOAT64) AS ratio_numerator,
          CAST(ratio_denominator AS FLOAT64) AS ratio_denominator
        FROM ${table('vw_portfolio_valued')}
        WHERE ticker = @ticker OR normalized_ticker = @ticker
        ORDER BY market_value_usd DESC
        LIMIT 1
      ),
      daily_prices AS (
        SELECT
          price_date AS date,
          CAST(market_price AS FLOAT64) AS market_price,
          currency
        FROM ${table('vw_daily_latest_prices')} p
        CROSS JOIN asset a
        WHERE p.ticker = COALESCE(a.underlying_ticker, a.normalized_ticker)
      ),
      daily_fx AS (
        SELECT
          DATE(as_of_ts, 'America/Argentina/Buenos_Aires') AS date,
          CAST(rate AS FLOAT64) AS usdars
        FROM ${table('fx_rates')}
        WHERE base_currency = 'USD' AND quote_currency = 'ARS'
        QUALIFY ROW_NUMBER() OVER (PARTITION BY date ORDER BY as_of_ts DESC) = 1
      ),
      movement_daily AS (
        SELECT
          fecha AS date,
          SUM(CASE
            WHEN movement_type IN ('BUY_ASSET', 'BUY_USD', 'BUY_USDT', 'INCOME_USD') THEN CAST(quantity AS FLOAT64)
            WHEN movement_type IN ('SELL_ASSET', 'SELL_USD', 'SELL_USDT', 'EXPENSE_USD') THEN -CAST(quantity AS FLOAT64)
            ELSE 0 END) AS quantity_flow,
          SUM(CASE
            WHEN movement_type IN ('BUY_ASSET', 'BUY_USD', 'BUY_USDT', 'INCOME_USD') THEN
              CASE WHEN settlement_currency = 'ARS' THEN SAFE_DIVIDE(CAST(net_amount AS FLOAT64), CAST(fx_rate AS FLOAT64)) ELSE CAST(net_amount AS FLOAT64) END
            WHEN movement_type IN ('SELL_ASSET', 'SELL_USD', 'SELL_USDT', 'EXPENSE_USD') THEN -
              CASE WHEN settlement_currency = 'ARS' THEN SAFE_DIVIDE(CAST(net_amount AS FLOAT64), CAST(fx_rate AS FLOAT64)) ELSE CAST(net_amount AS FLOAT64) END
            ELSE 0 END) AS net_flow_usd
        FROM ${table('movements')} m
        CROSS JOIN asset a
        WHERE m.ticker = a.ticker OR m.ticker = a.normalized_ticker
        GROUP BY date
      ),
      all_dates AS (
        SELECT date FROM daily_prices
        UNION DISTINCT
        SELECT date FROM movement_daily
      ),
      dated_raw AS (
        SELECT dates.date, p.market_price, p.currency,
          COALESCE(m.quantity_flow, 0) quantity_flow,
          COALESCE(m.net_flow_usd, 0) net_flow_usd
        FROM all_dates dates
        LEFT JOIN daily_prices p USING (date)
        LEFT JOIN movement_daily m USING (date)
        WHERE dates.date >= (SELECT MIN(date) FROM movement_daily)
      ),
      dated AS (
        SELECT
          date,
          LAST_VALUE(market_price IGNORE NULLS) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS market_price,
          LAST_VALUE(currency IGNORE NULLS) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS currency,
          quantity_flow,
          net_flow_usd
        FROM dated_raw
      ),
      valued AS (
        SELECT
          d.date,
          SUM(quantity_flow) OVER (ORDER BY d.date) AS quantity,
          d.net_flow_usd,
          CASE
            WHEN a.underlying_ticker IS NOT NULL THEN d.market_price * SAFE_DIVIDE(a.ratio_denominator, a.ratio_numerator)
            WHEN d.currency = 'ARS' THEN SAFE_DIVIDE(d.market_price, fx.usdars)
            ELSE d.market_price
          END AS price_usd
        FROM dated d
        CROSS JOIN asset a
        LEFT JOIN daily_fx fx USING (date)
      ),
      snapshots AS (
        SELECT snapshot_date AS date, CAST(market_value_usd AS FLOAT64) AS portfolio_value_usd
        FROM ${table('portfolio_snapshots')}
      )
      SELECT
        v.date, v.quantity, v.net_flow_usd, v.price_usd,
        v.quantity * v.price_usd AS market_value_usd,
        SAFE_DIVIDE(v.quantity * v.price_usd, s.portfolio_value_usd) * 100 AS portfolio_weight_pct
      FROM valued v
      LEFT JOIN snapshots s USING (date)
      WHERE v.quantity > 0 AND v.price_usd IS NOT NULL
      ORDER BY v.date
    `;

    const quantitySeriesQuery = `
      WITH asset AS (
        SELECT ticker, normalized_ticker
        FROM ${table('vw_portfolio_valued')}
        WHERE ticker = @ticker OR normalized_ticker = @ticker
        ORDER BY market_value_usd DESC
        LIMIT 1
      ),
      movement_daily AS (
        SELECT
          fecha AS date,
          SUM(CASE
            WHEN movement_type IN ('BUY_ASSET', 'BUY_USD', 'BUY_USDT', 'INCOME_USD') THEN CAST(quantity AS FLOAT64)
            WHEN movement_type IN ('SELL_ASSET', 'SELL_USD', 'SELL_USDT', 'EXPENSE_USD') THEN -CAST(quantity AS FLOAT64)
            ELSE 0
          END) AS quantity_flow
        FROM ${table('movements')} m
        CROSS JOIN asset a
        WHERE m.ticker = a.ticker OR m.ticker = a.normalized_ticker
        GROUP BY date
      )
      SELECT date, quantity
      FROM (
        SELECT
          date,
          SUM(quantity_flow) OVER (ORDER BY date) AS quantity
        FROM movement_daily

        UNION ALL

        SELECT DATE_SUB(MIN(date), INTERVAL 1 DAY) AS date, 0 AS quantity
        FROM movement_daily
      )
      ORDER BY date
    `;

    const [currentRows, seriesRows, quantitySeriesRows] = await Promise.all([
      runQuery(currentQuery, { ticker }),
      runQuery(seriesQuery, { ticker }),
      runQuery(quantitySeriesQuery, { ticker }),
    ]);
    const current = normalizeBigQueryRows(currentRows)[0];
    if (!current) return res.status(404).json({ error: "Asset not found" });

    const series = normalizeBigQueryRows(seriesRows).map((row) => ({
      date: row.date,
      quantity: Number(row.quantity || 0),
      net_flow_usd: Number(row.net_flow_usd || 0),
      price_usd: Number(row.price_usd || 0),
      market_value_usd: Number(row.market_value_usd || 0),
      portfolio_weight_pct: row.portfolio_weight_pct == null ? null : Number(row.portfolio_weight_pct),
    }));
    const quantitySeries = normalizeBigQueryRows(quantitySeriesRows).map((row) => ({
      date: row.date,
      quantity: Number(row.quantity || 0),
    }));
    const periods = ["1D", "7D", "30D", "YTD", "1Y", "MAX"].map((period) => calculateAssetPeriod(series, period));
    const first = series[0];
    const last = series[series.length - 1];

    res.json({
      asset: current,
      summary: {
        current_weight_pct: Number(current.current_weight_pct || 0),
        quantity_change: first && last ? last.quantity - first.quantity : 0,
        quantity_change_pct: first?.quantity ? ((last.quantity / first.quantity) - 1) * 100 : null,
        first_position_date: current.first_position_date || null,
        price_history_start_date: first?.date || null,
      },
      periods,
      series,
      quantity_series: quantitySeries,
    });
  } catch (error) {
    console.error("Error in getAssetDetail:", error);
    res.status(500).json({ error: "Error fetching asset detail", details: error?.message });
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
    await ensureCustodyTransfersTable();
    const movementTicker = `COALESCE(
      (SELECT ANY_VALUE(UPPER(COALESCE(NULLIF(v.normalized_ticker, ''), v.ticker)))
       FROM ${table('vw_portfolio_valued')} v WHERE UPPER(v.ticker) = UPPER(m.ticker)),
      ${custodyTickerSql('m.ticker')}
    )`;
    const query = `
      WITH movement_legs AS (
        SELECT ${movementTicker} AS ticker, ${custodyBrokerSql('m.broker')} AS broker,
          SUM(CASE WHEN movement_type IN ('BUY_ASSET', 'BUY_USDT') THEN CAST(quantity AS FLOAT64)
                   WHEN movement_type IN ('SELL_ASSET', 'SELL_USDT') THEN -CAST(quantity AS FLOAT64) ELSE 0 END) AS quantity
        FROM ${table('movements')} m
        WHERE movement_type IN ('BUY_ASSET', 'SELL_ASSET', 'BUY_USDT', 'SELL_USDT') AND quantity IS NOT NULL
        GROUP BY 1, 2
      ),
      transfer_legs AS (
        SELECT ${custodyTickerSql('ticker')} AS ticker, ${custodyBrokerSql('from_broker')} AS broker, -CAST(quantity AS FLOAT64) AS quantity FROM ${table('custody_transfers')}
        UNION ALL
        SELECT ${custodyTickerSql('ticker')} AS ticker, ${custodyBrokerSql('to_broker')} AS broker, CAST(quantity AS FLOAT64) AS quantity FROM ${table('custody_transfers')}
      ),
      located AS (
        SELECT ticker, broker, SUM(quantity) AS quantity FROM (SELECT * FROM movement_legs UNION ALL SELECT * FROM transfer_legs) GROUP BY 1, 2
      ),
      located_totals AS (
        SELECT ticker, SUM(GREATEST(quantity, 0)) AS positive_quantity
        FROM located GROUP BY 1
      ),
      valued AS (
        SELECT UPPER(COALESCE(NULLIF(normalized_ticker, ''), ticker)) AS ticker,
          SUM(CAST(quantity_net AS FLOAT64)) AS expected_quantity,
          SAFE_DIVIDE(SUM(CAST(market_value_usd AS FLOAT64)), NULLIF(SUM(CAST(quantity_net AS FLOAT64)), 0)) AS unit_value_usd
        FROM ${table('vw_portfolio_valued')}
        WHERE UPPER(COALESCE(NULLIF(normalized_ticker, ''), ticker)) != 'USD'
        GROUP BY 1
      ),
      allocation AS (
        SELECT l.broker,
          GREATEST(l.quantity, 0) * LEAST(1, SAFE_DIVIDE(v.expected_quantity, NULLIF(t.positive_quantity, 0))) * v.unit_value_usd AS invested_usd
        FROM located l JOIN valued v USING (ticker) JOIN located_totals t USING (ticker)
        WHERE l.quantity > 0 AND v.expected_quantity > 0
        UNION ALL
        SELECT 'Por confirmar' AS broker,
          GREATEST(v.expected_quantity - COALESCE(t.positive_quantity, 0), 0) * v.unit_value_usd AS invested_usd
        FROM valued v LEFT JOIN located_totals t USING (ticker)
        WHERE v.expected_quantity > COALESCE(t.positive_quantity, 0)
      )
      SELECT broker, SUM(invested_usd) AS invested_usd
      FROM allocation
      GROUP BY 1 HAVING invested_usd > 0 ORDER BY invested_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getPlatformAllocation:", error);
    res.status(500).json({ error: "Error fetching platform allocation" });
  }
}

async function getCustodyAudit(req, res) {
  try {
    await ensureCustodyTransfersTable();
    const movementTicker = `COALESCE(
      (SELECT ANY_VALUE(UPPER(COALESCE(NULLIF(v.normalized_ticker, ''), v.ticker)))
       FROM ${table('vw_portfolio_valued')} v WHERE UPPER(v.ticker) = UPPER(m.ticker)),
      ${custodyTickerSql('m.ticker')}
    )`;
    const transferTicker = custodyTickerSql('ticker');
    const movementBroker = custodyBrokerSql('broker');
    const fromBroker = custodyBrokerSql('from_broker');
    const toBroker = custodyBrokerSql('to_broker');

    const rowsQuery = `
      WITH movement_legs AS (
        SELECT
          ${movementTicker} AS ticker,
          COALESCE(NULLIF(TRIM(owner), ''), 'Sin titular') AS owner,
          ${movementBroker} AS platform,
          SUM(CASE
            WHEN movement_type IN ('BUY_ASSET', 'BUY_USDT') THEN CAST(quantity AS NUMERIC)
            WHEN movement_type IN ('SELL_ASSET', 'SELL_USDT') THEN -CAST(quantity AS NUMERIC)
            ELSE 0 END) AS quantity
        FROM ${table('movements')} m
        WHERE movement_type IN ('BUY_ASSET', 'SELL_ASSET', 'BUY_USDT', 'SELL_USDT')
          AND quantity IS NOT NULL
        GROUP BY 1, 2, 3
      ),
      transfer_legs AS (
        SELECT ${transferTicker} AS ticker,
          COALESCE(NULLIF(TRIM(owner), ''), 'Sin titular') AS owner,
          ${fromBroker} AS platform, -CAST(quantity AS NUMERIC) AS quantity
        FROM ${table('custody_transfers')}
        UNION ALL
        SELECT ${transferTicker} AS ticker,
          COALESCE(NULLIF(TRIM(owner), ''), 'Sin titular') AS owner,
          ${toBroker} AS platform, CAST(quantity AS NUMERIC) AS quantity
        FROM ${table('custody_transfers')}
      ),
      located AS (
        SELECT ticker, owner, platform, SUM(quantity) AS located_quantity
        FROM (SELECT * FROM movement_legs UNION ALL SELECT * FROM transfer_legs)
        GROUP BY 1, 2, 3
      ),
      expected AS (
        SELECT
          UPPER(COALESCE(NULLIF(normalized_ticker, ''), ticker)) AS ticker,
          SUM(CAST(quantity_net AS FLOAT64)) AS expected_quantity,
          SUM(CAST(market_value_usd AS FLOAT64)) AS market_value_usd
        FROM ${table('vw_portfolio_valued')}
        WHERE UPPER(COALESCE(NULLIF(normalized_ticker, ''), ticker)) NOT IN ('USD')
        GROUP BY 1
      ),
      located_totals AS (
        SELECT ticker, SUM(GREATEST(CAST(located_quantity AS FLOAT64), 0)) AS total_located_quantity
        FROM located GROUP BY 1
      )
      SELECT
        l.ticker, l.owner, l.platform,
        CAST(l.located_quantity AS FLOAT64) AS quantity,
        e.expected_quantity,
        COALESCE(lt.total_located_quantity, 0) AS total_located_quantity,
        e.expected_quantity - COALESCE(lt.total_located_quantity, 0) AS difference_quantity,
        SAFE_DIVIDE(e.market_value_usd, NULLIF(e.expected_quantity, 0)) * CAST(l.located_quantity AS FLOAT64) AS market_value_usd,
        CASE
          WHEN l.platform = 'Sin plataforma' THEN 'MISSING_PLATFORM'
          WHEN ABS(e.expected_quantity - COALESCE(lt.total_located_quantity, 0)) > GREATEST(ABS(e.expected_quantity) * 0.000001, 0.00000001) THEN 'MISMATCH'
          ELSE 'OK'
        END AS status
      FROM located l
      LEFT JOIN expected e USING (ticker)
      LEFT JOIN located_totals lt USING (ticker)
      WHERE CAST(l.located_quantity AS FLOAT64) > 0.00000001
        AND e.expected_quantity > 0.00000001
      ORDER BY l.ticker, l.owner, quantity DESC
    `;

    const assetsQuery = `
      WITH movement_totals AS (
        SELECT ${movementTicker} AS ticker,
          SUM(CASE WHEN movement_type IN ('BUY_ASSET', 'BUY_USDT') THEN CAST(quantity AS FLOAT64)
                   WHEN movement_type IN ('SELL_ASSET', 'SELL_USDT') THEN -CAST(quantity AS FLOAT64) ELSE 0 END) AS located_quantity,
          COUNTIF((broker IS NULL OR TRIM(broker) = '') AND movement_type IN ('BUY_ASSET', 'BUY_USDT')) AS missing_platform_movements
        FROM ${table('movements')} m
        WHERE movement_type IN ('BUY_ASSET', 'SELL_ASSET', 'BUY_USDT', 'SELL_USDT')
        GROUP BY 1
      ),
      expected AS (
        SELECT UPPER(COALESCE(NULLIF(normalized_ticker, ''), ticker)) AS ticker,
          SUM(CAST(quantity_net AS FLOAT64)) AS expected_quantity,
          SUM(CAST(market_value_usd AS FLOAT64)) AS market_value_usd
        FROM ${table('vw_portfolio_valued')}
        WHERE UPPER(COALESCE(NULLIF(normalized_ticker, ''), ticker)) != 'USD'
        GROUP BY 1
      ),
      keys AS (SELECT ticker FROM expected WHERE expected_quantity > 0.00000001)
      SELECT k.ticker, COALESCE(e.expected_quantity, 0) AS expected_quantity,
        COALESCE(m.located_quantity, 0) AS located_quantity,
        COALESCE(e.expected_quantity, 0) - COALESCE(m.located_quantity, 0) AS difference_quantity,
        COALESCE(e.market_value_usd, 0) AS market_value_usd,
        COALESCE(m.missing_platform_movements, 0) AS missing_platform_movements,
        CASE
          WHEN COALESCE(m.missing_platform_movements, 0) > 0 THEN 'REVIEW'
          WHEN ABS(COALESCE(e.expected_quantity, 0) - COALESCE(m.located_quantity, 0)) > GREATEST(ABS(COALESCE(e.expected_quantity, 0)) * 0.000001, 0.00000001) THEN 'MISMATCH'
          ELSE 'OK'
        END AS status
      FROM keys k LEFT JOIN expected e USING (ticker) LEFT JOIN movement_totals m USING (ticker)
      ORDER BY market_value_usd DESC, ticker
    `;

    const transfersQuery = `SELECT id, transfer_date, ticker, owner, from_broker, to_broker,
      CAST(quantity AS FLOAT64) AS quantity, description, created_at
      FROM ${table('custody_transfers')} ORDER BY transfer_date DESC, created_at DESC`;
    const [rows, assets, transfers] = await Promise.all([
      runQuery(rowsQuery), runQuery(assetsQuery), runQuery(transfersQuery),
    ]);
    const normalizedRows = normalizeBigQueryRows(rows);
    const normalizedAssets = normalizeBigQueryRows(assets);
    res.json({
      rows: normalizedRows,
      assets: normalizedAssets,
      transfers: normalizeBigQueryRows(transfers),
      summary: {
        assets: normalizedAssets.length,
        ok: normalizedAssets.filter((row) => row.status === 'OK').length,
        review: normalizedAssets.filter((row) => row.status !== 'OK').length,
        missingPlatform: normalizedRows.filter((row) => row.platform === 'Sin plataforma').length,
        negativeBalances: 0,
      },
    });
  } catch (error) {
    console.error('Error in getCustodyAudit:', error);
    res.status(500).json({ error: 'Error fetching custody audit', details: error?.message });
  }
}

async function createCustodyTransfer(req, res) {
  try {
    await ensureCustodyTransfersTable();
    const { transfer_date, ticker, owner, from_broker, to_broker, quantity, description } = req.body || {};
    const parsedQuantity = Number(quantity);
    if (!transfer_date || !ticker || !from_broker || !to_broker) return res.status(400).json({ error: 'Fecha, activo, origen y destino son obligatorios.' });
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero.' });
    if (String(from_broker).trim().toLowerCase() === String(to_broker).trim().toLowerCase()) return res.status(400).json({ error: 'La plataforma de origen y destino deben ser diferentes.' });
    const id = crypto.randomUUID();
    await runQuery(`INSERT INTO ${table('custody_transfers')}
      (id, transfer_date, ticker, owner, from_broker, to_broker, quantity, description, created_at)
      VALUES (@id, DATE(@transfer_date), @ticker, @owner, @from_broker, @to_broker, CAST(@quantity AS NUMERIC), @description, CURRENT_TIMESTAMP())`, {
      id, transfer_date, ticker: String(ticker).trim().toUpperCase(), owner: owner || null,
      from_broker: String(from_broker).trim(), to_broker: String(to_broker).trim(),
      quantity: parsedQuantity, description: description || null,
    });
    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('Error creating custody transfer:', error);
    res.status(500).json({ error: 'Error creating custody transfer', details: error?.message });
  }
}

async function deleteCustodyTransfer(req, res) {
  try {
    await ensureCustodyTransfersTable();
    const result = await runQuery(`SELECT id FROM ${table('custody_transfers')} WHERE id = @id LIMIT 1`, { id: req.params.id });
    if (!result.length) return res.status(404).json({ error: 'Transferencia no encontrada.' });
    await runQuery(`DELETE FROM ${table('custody_transfers')} WHERE id = @id`, { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custody transfer:', error);
    res.status(500).json({ error: 'Error deleting custody transfer', details: error?.message });
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

async function getAssetPerformance(req, res) {
  try {
    const query = `
      SELECT
        ticker,
        internal_ticker,
        asset_class,
        provider,
        provider_symbol,
        quote_currency,
        current_price,
        current_price_date,
        first_price_date,
        last_price_date,
        days_with_price,
        calendar_days,
        return_7d,
        return_30d,
        return_90d,
        low_range,
        high_range,
        position_range,
        drawdown_range,
        volatility_30d,
        risk_adjusted_return_30d,
        performance_score,
        trend_points
      FROM ${table("vw_asset_performance")}
      WHERE ticker != 'USDT'
      ORDER BY performance_score DESC
    `;

    const rows = await runQuery(query);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error getAssetPerformance:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function getHistoricalPerformance(req, res) {
  try {
    const query = `
      SELECT
        y.year,
        y.start_date,
        y.end_date,
        y.approx_start_value_usd,

        ARRAY_AGG(
          m.end_value_usd
          ORDER BY CAST(m.month AS INT64) DESC
          LIMIT 1
        )[OFFSET(0)] AS approx_end_value_usd,

        y.net_asset_flow_usd,
        y.total_adjusted_pnl_usd,
        y.twr_performance_pct,

        ARRAY_AGG(
          STRUCT(
            m.month,
            m.month_date,
            m.start_date,
            m.end_date,
            m.start_value_usd,
            m.end_value_usd,
            m.net_asset_flow_usd,
            m.adjusted_pnl_usd,
            m.adjusted_performance_pct,
            m.gross_performance_pct,
            m.movements_count
          )
          ORDER BY m.month
        ) AS months

      FROM ${table("vw_portfolio_calendar_year_performance_twr")} y

      LEFT JOIN ${table("vw_portfolio_calendar_month_performance_adjusted")} m
        ON m.year = y.year

      GROUP BY
        y.year,
        y.start_date,
        y.end_date,
        y.approx_start_value_usd,
        y.net_asset_flow_usd,
        y.total_adjusted_pnl_usd,
        y.twr_performance_pct

      ORDER BY y.year DESC
    `;

    const rows = await runQuery(query);

    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getHistoricalPerformance:", error);

    res.status(500).json({
      error: "Error fetching historical performance",
    });
  }
}

async function getVintageReturns(req, res) {
  try {
    const query = `
      SELECT
        buy_year,
        invested_usd,
        current_value_usd,
        pnl_usd,
        pnl_pct,
        assets_count,
        lots_count
      FROM ${table("vw_portfolio_vintage_returns")}
      ORDER BY buy_year DESC
    `;

    const rows = await runQuery(query);

    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getVintageReturns:", error);

    res.status(500).json({
      error: "Error fetching vintage returns",
    });
  }
}

async function getDecisionMaker(req, res) {
  try {
    const holdingsQuery = `
      SELECT
        ticker,
        normalized_ticker,
        market_price,
        market_value_usd,
        cost_value_usd
      FROM ${table('vw_portfolio_valued')}
      WHERE market_value_usd IS NOT NULL
    `;

    const marketQuery = `
      SELECT *
      FROM ${table('vw_market_watch')}
    `;

    const tradingBalancesQuery = `
      SELECT
        asset,
        quantity,
        price_usd,
        market_value_usd
      FROM ${table('vw_trading_balances_valued')}
    `;

    const [holdingsRows, marketRows, tradingBalancesRows] = await Promise.all([
      runQuery(holdingsQuery),
      runQuery(marketQuery),
      runQuery(tradingBalancesQuery),
    ]);

    const holdings = normalizeBigQueryRows(holdingsRows);
    const marketData = normalizeBigQueryRows(marketRows);
    const tradingBalances = normalizeBigQueryRows(tradingBalancesRows);

    const tradingUsd = tradingBalances.reduce((sum, row) => {
      return sum + Number(row.market_value_usd || 0);
    }, 0);

    const result = await buildDecisionMaker({
      holdings,
      marketData,
      tradingUsd,
    });

    res.json(result);
  } catch (error) {
    console.error("Error in getDecisionMaker:", error);

    res.status(500).json({
      error: "Error building decision maker",
      details: error.message,
    });
  }
}

async function getBingxSpotDebug(req, res) {
  try {
    const { symbol = "BTC-USDT", lookbackDays = 7, limit = 100 } = req.query;

    const endTime = Date.now();
    const startTime =
      endTime - Number(lookbackDays) * 24 * 60 * 60 * 1000;

    const [orders, trades] = await Promise.all([
      getBingxSpotHistoryOrders({
        symbol,
        startTime,
        endTime,
        limit: Number(limit),
      }),
      getBingxSpotMyTrades({
        symbol,
        startTime,
        endTime,
        limit: Number(limit),
      }),
    ]);

    res.json({
      provider: "BINGX",
      type: "SPOT_DEBUG",
      symbol,
      startTime,
      endTime,
      orders,
      trades,
    });
  } catch (error) {
    console.error("getBingxSpotDebug error:", error);
    res.status(500).json({
      error: "Error consultando BingX Spot",
      detail: error.message,
    });
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDateStringFromMs(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

function getSpotAssetFromSymbol(symbol) {
  return String(symbol || "").replace("-USDT", "").replace("USDT", "");
}

function getPortfolioTickerForCrypto(asset) {
  const cleanAsset = String(asset || "").toUpperCase();

  const map = {
    BTC: "CURRENCY:BTCARS",
    ETH: "CURRENCY:ETHARS",
    SOL: "CURRENCY:SOLARS",
  };

  return map[cleanAsset] || cleanAsset;
}

function buildBingxSpotExternalId(order) {
  return `BINGX_SPOT_${order.orderId}`;
}

function normalizeBingxSpotOrdersPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function getExistingBingxSpotExternalIds() {
  const query = `
    SELECT DISTINCT
      JSON_VALUE(raw_payload, '$.external_id') AS external_id
    FROM ${table("movements")}
    WHERE source_table = 'bingx_spot'
      AND JSON_VALUE(raw_payload, '$.external_id') IS NOT NULL
  `;

  const rows = await runQuery(query);
  const normalized = normalizeBigQueryRows(rows);

  return new Set(
    normalized
      .map((r) => r.external_id)
      .filter(Boolean)
  );
}

function mapBingxSpotOrderToPreviewItem(order) {
  const asset = getSpotAssetFromSymbol(order.symbol);
  const side = String(order.side || "").toUpperCase();

  const quantity = toNumber(order.executedQty);
  const amountUsd = toNumber(order.cummulativeQuoteQty);
  const priceUsd =
    toNumber(order.avgPrice) ||
    (quantity > 0 ? amountUsd / quantity : toNumber(order.price));

  const date = toDateStringFromMs(order.updateTime || order.time);
  const externalId = buildBingxSpotExternalId(order);

  return {
    externalId,
    orderId: String(order.orderId),
    symbol: order.symbol,
    asset,
    side,
    date,
    quantity,
    amountUsd,
    priceUsd,
    type: order.type,
    status: order.status,
    friendlyText:
      side === "BUY"
        ? `Compra ${asset} con USDT`
        : `Venta ${asset} a USDT`,
    rawOrder: order,
  };
}

async function getBingxSpotSyncPreview(req, res) {
  try {
    const {
      symbol = "BTC-USDT",
      lookbackDays,
      limit = 100,
    } = req.query;

    const endTime = Date.now();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startTime = lookbackDays
      ? endTime - Number(lookbackDays) * 24 * 60 * 60 * 1000
      : startOfToday.getTime();

    const [ordersPayload, tradesPayload] = await Promise.all([
      getBingxSpotHistoryOrders({
        symbol,
        startTime,
        endTime,
        limit: Number(limit),
      }),
      getBingxSpotMyTrades({
        symbol,
        startTime,
        endTime,
        limit: Number(limit),
      }),
    ]);

    const orders = normalizeBingxSpotOrdersPayload(ordersPayload);
    const fills = normalizeBingxSpotTradesPayload(tradesPayload);

    const orderById = new Map(
      orders.map((order) => [String(order.orderId), order])
    );

    const groupedFills = groupSpotFillsByOrderId(fills);

    const previewItems = Array.from(groupedFills.entries())
      .map(([orderId, orderFills]) =>
        buildSpotPreviewItemFromFills(
          orderId,
          orderFills,
          orderById.get(orderId) || null
        )
      )
      .filter((item) => {
        return (
          item.quantity > 0 &&
          item.amountUsd > 0 &&
          ["BUY", "SELL"].includes(item.side)
        );
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const existingExternalIds = await getExistingBingxSpotExternalIds();

    const rowsToInsert = previewItems.filter(
      (item) => !existingExternalIds.has(item.externalId)
    );

    const alreadyExistsRows = previewItems.filter((item) =>
      existingExternalIds.has(item.externalId)
    );

    res.json({
      provider: "BINGX",
      type: "SPOT_SYNC_PREVIEW",
      symbol,
      lookbackDays: lookbackDays ? Number(lookbackDays) : 0,
      mode: lookbackDays ? "LOOKBACK_DAYS" : "TODAY",
      totalOrders: orders.length,
      totalFills: fills.length,
      groupedOrders: previewItems.length,
      newOrders: rowsToInsert.length,
      alreadyExists: alreadyExistsRows.length,
      rowsToInsert,
      alreadyExistsRows,
    });
  } catch (error) {
    console.error("getBingxSpotSyncPreview error:", error);

    res.status(500).json({
      error: "Error generando preview spot BingX",
      detail: error.message,
    });
  }
}

async function syncBingxSpotConfirm(req, res) {
  try {
    const {
      symbol = "BTC-USDT",
      lookbackDays,
      limit = 100,
    } = req.query;

    let previewPayload;

    const previewReq = {
      query: {
        symbol,
        lookbackDays,
        limit,
      },
    };

    const previewRes = {
      json: (data) => {
        previewPayload = data;
      },
      status: (code) => ({
        json: (data) => {
          throw new Error(data.detail || data.error || `Preview failed ${code}`);
        },
      }),
    };

    await getBingxSpotSyncPreview(previewReq, previewRes);

    const rowsToInsert = previewPayload.rowsToInsert || [];
    const movementRows = rowsToInsert
      .flatMap(buildBingxSpotMovements)
      .map((row) => ({
        source_table: row.source_table || "",
        fecha: row.fecha || "",
        movement_type: row.movement_type || "",
        category: row.category || "",
        owner: row.owner || "",
        ticker: row.ticker || "",
        instrument_type: row.instrument_type || "",
        side: row.side || "",
        quantity: String(row.quantity || 0),
        unit_price: String(row.unit_price || 0),
        price_currency: row.price_currency || "USD",
        gross_amount: String(row.gross_amount || 0),
        net_amount: String(row.net_amount || 0),
        settlement_currency: row.settlement_currency || "USD",
        broker: row.broker || "Bingx",
        description: row.description || "",
        raw_payload: row.raw_payload || "{}",
      }));

    if (!movementRows.length) {
      return res.json({
        ok: true,
        inserted: 0,
        message: "No hay compras spot nuevas para importar",
        preview: previewPayload,
      });
    }

    const query = `
      INSERT INTO ${table("movements")}
      (
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
      )
      SELECT
        GENERATE_UUID(),
        source_table,
        DATE(fecha),
        movement_type,
        category,
        owner,
        ticker,
        instrument_type,
        side,
        CAST(quantity AS NUMERIC),
        CAST(unit_price AS NUMERIC),
        price_currency,
        CAST(gross_amount AS NUMERIC),
        CAST(net_amount AS NUMERIC),
        settlement_currency,
        CAST(NULL AS NUMERIC),
        broker,
        description,
        raw_payload
      FROM UNNEST(@rows)
    `;

    await runQuery(query, {
      rows: movementRows,
    });

    res.json({
      ok: true,
      inserted: movementRows.length,
      importedOrders: rowsToInsert.length,
      insertedRows: movementRows,
      preview: previewPayload,
    });
  } catch (error) {
    console.error("syncBingxSpotConfirm error:", error);

    res.status(500).json({
      error: "Error confirmando import spot BingX",
      detail: error.message,
    });
  }
}

function buildBingxSpotMovements(item) {
  const asset = String(item.asset || "").toUpperCase();
  const side = String(item.side || "").toUpperCase();

  const portfolioTicker = getPortfolioTickerForCrypto(asset);
  const transferGroupId = item.externalId;

  const commonRawPayload = {
    family: "BINGX_SPOT_SWAP",
    external_id: item.externalId,
    order_id: item.orderId,
    symbol: item.symbol,
    asset,
    side,
    date: item.date,
    quantity: item.quantity,
    gross_quantity: item.grossQuantity,
    amount_usd: item.amountUsd,
    price_usd: item.priceUsd,
    commission_asset: item.commissionAsset,
    commission_quantity: item.commissionQuantity,
    type: item.type,
    status: item.status,
    transfer_group_id: transferGroupId,
    raw_order: item.rawOrder,
    raw_fills: item.rawFills,
  };

  if (side === "BUY") {
    return [
      {
        source_table: "bingx_spot",
        fecha: item.date,
        movement_type: "SELL_USDT",
        category: "CRYPTO",
        owner: "Horacio",
        ticker: "USDT",
        instrument_type: "USDT",
        side: "SELL",
        quantity: item.amountUsd,
        unit_price: 1,
        price_currency: "USD",
        gross_amount: item.amountUsd,
        net_amount: item.amountUsd,
        settlement_currency: "USD",
        fx_rate: null,
        broker: "Bingx",
        description: `Swap USDT a ${asset}`,
        raw_payload: JSON.stringify({
          ...commonRawPayload,
          leg: "SELL_USDT",
        }),
      },
      {
        source_table: "bingx_spot",
        fecha: item.date,
        movement_type: "BUY_ASSET",
        category: "PORTFOLIO",
        owner: "Horacio",
        ticker: portfolioTicker,
        instrument_type: "ASSET",
        side: "BUY",
        quantity: item.quantity,
        unit_price: item.priceUsd,
        price_currency: "USD",
        gross_amount: item.amountUsd,
        net_amount: item.amountUsd,
        settlement_currency: "USD",
        fx_rate: null,
        broker: "Bingx",
        description: `Swap USDT a ${asset}`,
        raw_payload: JSON.stringify({
          ...commonRawPayload,
          leg: "BUY_ASSET",
        }),
      },
    ];
  }

  if (side === "SELL") {
    return [
      {
        source_table: "bingx_spot",
        fecha: item.date,
        movement_type: "SELL_ASSET",
        category: "PORTFOLIO",
        owner: "Horacio",
        ticker: portfolioTicker,
        instrument_type: "ASSET",
        side: "SELL",
        quantity: item.quantity,
        unit_price: item.priceUsd,
        price_currency: "USD",
        gross_amount: item.amountUsd,
        net_amount: item.amountUsd,
        settlement_currency: "USD",
        fx_rate: null,
        broker: "Bingx",
        description: `Swap ${asset} a USDT`,
        raw_payload: JSON.stringify({
          ...commonRawPayload,
          leg: "SELL_ASSET",
        }),
      },
      {
        source_table: "bingx_spot",
        fecha: item.date,
        movement_type: "BUY_USDT",
        category: "CRYPTO",
        owner: "Horacio",
        ticker: "USDT",
        instrument_type: "USDT",
        side: "BUY",
        quantity: item.amountUsd,
        unit_price: 1,
        price_currency: "USD",
        gross_amount: item.amountUsd,
        net_amount: item.amountUsd,
        settlement_currency: "USD",
        fx_rate: null,
        broker: "Bingx",
        description: `Swap ${asset} a USDT`,
        raw_payload: JSON.stringify({
          ...commonRawPayload,
          leg: "BUY_USDT",
        }),
      },
    ];
  }

  return [];
}

function normalizeBingxSpotTradesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fills)) return payload.fills;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function groupSpotFillsByOrderId(fills = []) {
  const grouped = new Map();

  for (const fill of fills) {
    const orderId = String(fill.orderId || "");
    if (!orderId) continue;

    if (!grouped.has(orderId)) {
      grouped.set(orderId, []);
    }

    grouped.get(orderId).push(fill);
  }

  return grouped;
}

function buildSpotPreviewItemFromFills(orderId, fills, order = null) {
  const firstFill = fills[0];

  const symbol = firstFill.symbol;
  const asset = getSpotAssetFromSymbol(symbol);
  const isBuyer = Boolean(firstFill.isBuyer);
  const side = isBuyer ? "BUY" : "SELL";

  const grossQuantity = fills.reduce(
    (sum, fill) => sum + toNumber(fill.qty),
    0
  );

  const amountUsd = fills.reduce(
    (sum, fill) => sum + toNumber(fill.quoteQty),
    0
  );

  const commissionInAsset = fills
    .filter((fill) => String(fill.commissionAsset || "").toUpperCase() === asset)
    .reduce((sum, fill) => sum + toNumber(fill.commission), 0);

  const netQuantity =
    side === "BUY"
      ? grossQuantity + commissionInAsset
      : grossQuantity;

  const priceUsd =
    netQuantity > 0
      ? amountUsd / netQuantity
      : amountUsd / grossQuantity;

  const lastTime = Math.max(...fills.map((fill) => Number(fill.time || 0)));

  const externalId = `BINGX_SPOT_${orderId}`;

  return {
    externalId,
    orderId,
    symbol,
    asset,
    side,
    date: toDateStringFromMs(lastTime),
    quantity: netQuantity,
    grossQuantity,
    amountUsd,
    priceUsd,
    commissionAsset: asset,
    commissionQuantity: commissionInAsset,
    type: order?.type || "UNKNOWN",
    status: order?.status || "FILLED",
    friendlyText:
      side === "BUY"
        ? `Compra ${asset} con USDT`
        : `Venta ${asset} a USDT`,
    rawOrder: order,
    rawFills: fills,
  };
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
  getCustodyAudit,
  createCustodyTransfer,
  deleteCustodyTransfer,
  getBenchmarkComparison,
  getAssetPerformance,
  getHistoricalPerformance,
  getVintageReturns,
  getDecisionMaker,
  getBingxSpotDebug,
  getBingxSpotSyncPreview,
  syncBingxSpotConfirm,
  getAssetDetail,
};
