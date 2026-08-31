const { runQuery } = require('../services/bigQueryService');
const { table } = require('../utils/bigqueryHelper');

function buildRangeFilter(range, field = 'snapshot_date') {
  switch ((range || '6M').toUpperCase()) {
    case '1M':
      return `${field} >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)`;
    case '3M':
      return `${field} >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)`;
    case '6M':
      return `${field} >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)`;
    case 'YTD':
      return `${field} >= DATE_TRUNC(CURRENT_DATE(), YEAR)`;
    case '1A':
      return `${field} >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR)`;
    case 'MAX':
    default:
      return '1=1';
  }
}

function capitalMovementsCte() {
  return `
    classified_capital_movements AS (
      SELECT
        fecha,
        CASE
          WHEN movement_type IN ('BUY_ASSET', 'SELL_ASSET')
            THEN ABS(SAFE_CAST(net_amount AS FLOAT64))
          WHEN movement_type IN ('BUY_USD', 'SELL_USD', 'BUY_USDT', 'SELL_USDT')
            THEN ABS(SAFE_CAST(quantity AS FLOAT64))
          WHEN movement_type IN ('INCOME_USD', 'EXPENSE_USD')
            THEN ABS(SAFE_CAST(net_amount AS FLOAT64))
          ELSE 0
        END AS amount_usd,
        CASE
          WHEN movement_type IN ('BUY_ASSET', 'BUY_USD', 'BUY_USDT', 'INCOME_USD') THEN 1
          WHEN movement_type IN ('SELL_ASSET', 'SELL_USD', 'SELL_USDT', 'EXPENSE_USD') THEN -1
          ELSE 0
        END AS sign
      FROM ${table('movements')}
      WHERE
        (
          source_table = 'transactions_raw'
          OR (
            transaction_group_id IS NULL
            AND NOT (
              movement_type IN ('BUY_USDT', 'SELL_USDT')
              AND flow_type = 'SETTLEMENT'
              AND NOT (
                source_table = 'cv_usdt_raw'
                AND movement_type = 'BUY_USDT'
                AND description = 'Venta BTC'
              )
            )
            AND source_table NOT IN ('bingx_spot', 'trading_transfer')
          )
        )
    ),
    capital_movements AS (
      SELECT
        fecha,
        amount_usd,
        sign
      FROM classified_capital_movements
      WHERE fecha IS NOT NULL
    ),
    undated_capital AS (
      SELECT
        COALESCE(SUM(sign * amount_usd), 0) AS net_flow_usd
      FROM classified_capital_movements
      WHERE fecha IS NULL
    ),
    daily_capital AS (
      SELECT
        fecha,
        SUM(sign * amount_usd) AS net_flow_usd
      FROM capital_movements
      GROUP BY fecha
    )
  `;
}

async function getNetContributionsHistory(req, res) {
  try {
    const dateFilter = buildRangeFilter(req.query.range, 'snapshot_date');

    const query = `
      WITH
      ${capitalMovementsCte()},
      latest_snapshot AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM ${table('portfolio_snapshots')}
      ),
      snapshots AS (
        SELECT snapshot_date
        FROM ${table('portfolio_snapshots')}
        WHERE ${dateFilter}
      )
      SELECT
        s.snapshot_date,
        COALESCE((
          SELECT SUM(d.net_flow_usd)
          FROM daily_capital d
          WHERE d.fecha <= s.snapshot_date
        ), 0)
        + CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN u.net_flow_usd
            ELSE 0
          END AS cumulative_net_contributions_usd
      FROM snapshots s
      CROSS JOIN latest_snapshot ls
      CROSS JOIN undated_capital u
      ORDER BY s.snapshot_date ASC
    `;

    const rows = await runQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error in getNetContributionsHistory:', error);
    res.status(500).json({ error: 'Error fetching net contributions history' });
  }
}

async function getHistoryWithNetContributions(req, res) {
  try {
    const dateFilter = buildRangeFilter(req.query.range, 's.snapshot_date');

    const query = `
      WITH
      ${capitalMovementsCte()},
      latest_snapshot AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM ${table('portfolio_snapshots')}
        WHERE ${buildRangeFilter(req.query.range, 'snapshot_date')}
      ),
      live_portfolio AS (
        SELECT
          COALESCE(SUM(CAST(market_value_usd AS FLOAT64)), 0) AS portfolio_market_usd,
          COALESCE(SUM(CAST(market_value_ars AS FLOAT64)), 0) AS portfolio_market_ars,
          COALESCE(SUM(CAST(cost_value_usd AS FLOAT64)), 0) AS portfolio_cost_usd,
          COALESCE(SUM(CAST(cost_value_ars AS FLOAT64)), 0) AS portfolio_cost_ars,
          COALESCE(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(market_value_usd AS FLOAT64) ELSE 0 END), 0) AS investments_usd,
          COALESCE(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(cost_value_usd AS FLOAT64) ELSE 0 END), 0) AS investments_cost_usd,
          COALESCE(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(cost_value_ars AS FLOAT64) ELSE 0 END), 0) AS investments_cost_ars,
          COALESCE(SUM(CASE WHEN category IN ('CASH', 'FX') THEN CAST(market_value_usd AS FLOAT64) ELSE 0 END), 0) AS liquidity_usd,
          COALESCE(SUM(CASE WHEN category = 'CRYPTO' THEN CAST(market_value_usd AS FLOAT64) ELSE 0 END), 0) AS crypto_usd,
          COALESCE(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_usd AS FLOAT64) ELSE 0 END), 0) AS unrealized_pnl_usd,
          COALESCE(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_ars AS FLOAT64) ELSE 0 END), 0) AS unrealized_pnl_ars,
          SAFE_DIVIDE(
            SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(pnl_usd AS FLOAT64) ELSE 0 END),
            NULLIF(SUM(CASE WHEN category = 'PORTFOLIO' THEN CAST(cost_value_usd AS FLOAT64) ELSE 0 END), 0)
          ) AS unrealized_pnl_pct,
          ANY_VALUE(CAST(usdars AS FLOAT64)) AS usdars
        FROM ${table('vw_portfolio_valued')}
      ),
      live_trading AS (
        SELECT
          COALESCE(SUM(CAST(market_value_usd AS FLOAT64)), 0) AS trading_retained_result_usd
        FROM ${table('vw_trading_balances_valued')}
      ),
      live AS (
        SELECT
          p.*,
          t.trading_retained_result_usd,
          p.portfolio_market_usd + t.trading_retained_result_usd AS total_with_trading_usd,
          p.portfolio_market_ars + t.trading_retained_result_usd * COALESCE(p.usdars, 0) AS total_with_trading_ars
        FROM live_portfolio p
        CROSS JOIN live_trading t
      ),
      history AS (
        SELECT
          s.snapshot_date,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.total_with_trading_usd
            ELSE COALESCE(s.total_with_trading_usd, s.market_value_usd)
          END AS market_value_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.total_with_trading_ars
            ELSE s.market_value_ars
          END AS market_value_ars,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.portfolio_cost_usd
            ELSE s.cost_value_usd
          END AS cost_value_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.portfolio_cost_ars
            ELSE s.cost_value_ars
          END AS cost_value_ars,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.unrealized_pnl_usd
            ELSE s.total_pnl_usd
          END AS total_pnl_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.unrealized_pnl_ars
            ELSE s.total_pnl_ars
          END AS total_pnl_ars,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.unrealized_pnl_pct
            ELSE s.total_pnl_pct
          END AS total_pnl_pct,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.investments_usd
            ELSE s.investments_usd
          END AS investments_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.investments_cost_usd
            ELSE s.investments_cost_usd
          END AS investments_cost_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.investments_cost_ars
            ELSE s.investments_cost_ars
          END AS investments_cost_ars,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.liquidity_usd
            ELSE s.liquidity_usd
          END AS liquidity_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.crypto_usd
            ELSE s.crypto_usd
          END AS crypto_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.trading_retained_result_usd
            ELSE COALESCE(s.trading_retained_result_usd, 0)
          END AS trading_retained_result_usd,
          CASE
            WHEN s.snapshot_date = ls.snapshot_date THEN l.total_with_trading_usd
            ELSE COALESCE(s.total_with_trading_usd, s.market_value_usd)
          END AS total_with_trading_usd,
          COALESCE((
            SELECT SUM(d.net_flow_usd)
            FROM daily_capital d
            WHERE d.fecha <= CASE
              WHEN s.snapshot_date = ls.snapshot_date THEN CURRENT_DATE()
              ELSE s.snapshot_date
            END
          ), 0)
          + CASE
              WHEN s.snapshot_date = ls.snapshot_date THEN u.net_flow_usd
              ELSE 0
            END AS cumulative_net_contributions_usd
        FROM ${table('portfolio_snapshots')} s
        CROSS JOIN latest_snapshot ls
        CROSS JOIN live l
        CROSS JOIN undated_capital u
        WHERE ${dateFilter}
      )
      SELECT *
      FROM history
      ORDER BY snapshot_date ASC
    `;

    const rows = await runQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error in getHistoryWithNetContributions:', error);
    res.status(500).json({ error: 'Error fetching portfolio history' });
  }
}

module.exports = {
  getNetContributionsHistory,
  getHistoryWithNetContributions,
};
