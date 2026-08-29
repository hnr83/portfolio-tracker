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
            AS unrealized_pnl_usd,

          SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_ars AS FLOAT64) ELSE 0 END)
            AS unrealized_pnl_ars,

          SAFE_DIVIDE(
            SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_usd AS FLOAT64) ELSE 0 END),
            NULLIF(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(cost_value_usd AS FLOAT64) ELSE 0 END), 0)
          ) AS unrealized_pnl_pct,

          ANY_VALUE(CAST(usdars AS FLOAT64)) AS usdars
        FROM ${table('vw_portfolio_valued')}
      ),

      realized AS (
        SELECT
          COALESCE(SUM(CAST(realized_proceeds_usd AS FLOAT64)), 0) AS realized_proceeds_usd,
          COALESCE(SUM(CAST(realized_cost_usd AS FLOAT64)), 0) AS realized_cost_usd,
          COALESCE(SUM(CAST(realized_pnl_usd AS FLOAT64)), 0) AS realized_pnl_usd
        FROM ${table('vw_realized_pnl')}
      ),

      trading AS (
        SELECT
          COALESCE(SUM(CAST(market_value_usd AS FLOAT64)), 0) AS trading_retained_result_usd
        FROM ${table('vw_trading_balances_valued')}
      )

      SELECT
        p.total_market_usd,
        p.total_market_ars,
        p.total_cost_usd,
        p.total_cost_ars,
        p.investments_market_usd,
        p.investments_market_ars,
        p.investments_cost_usd,
        p.usdars,

        COALESCE(p.unrealized_pnl_usd, 0) AS unrealized_pnl_usd,
        COALESCE(p.unrealized_pnl_ars, 0) AS unrealized_pnl_ars,
        p.unrealized_pnl_pct,

        COALESCE(r.realized_proceeds_usd, 0) AS realized_proceeds_usd,
        COALESCE(r.realized_cost_usd, 0) AS realized_cost_usd,
        COALESCE(r.realized_pnl_usd, 0) AS realized_pnl_usd,
        COALESCE(r.realized_pnl_usd, 0) * COALESCE(p.usdars, 0) AS realized_pnl_ars,

        COALESCE(p.unrealized_pnl_usd, 0)
          + COALESCE(r.realized_pnl_usd, 0)
          AS total_pnl_usd,

        COALESCE(p.unrealized_pnl_ars, 0)
          + COALESCE(r.realized_pnl_usd, 0) * COALESCE(p.usdars, 0)
          AS total_pnl_ars,

        -- Keep the existing percentage behavior for compatibility.
        -- Overall portfolio return should come from TWR rather than dividing
        -- cumulative realized PnL by the current open-position cost basis.
        p.unrealized_pnl_pct AS total_pnl_pct,

        COALESCE(t.trading_retained_result_usd, 0) AS trading_retained_result_usd,

        COALESCE(p.total_market_usd, 0)
          + COALESCE(t.trading_retained_result_usd, 0)
          AS total_with_trading_usd,

        COALESCE(p.total_market_ars, 0)
          + COALESCE(t.trading_retained_result_usd, 0) * COALESCE(p.usdars, 0)
          AS total_with_trading_ars
      FROM portfolio p
      CROSS JOIN realized r
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

module.exports = {
  getSummary,
};
