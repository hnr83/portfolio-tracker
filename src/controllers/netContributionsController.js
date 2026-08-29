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
    capital_movements AS (
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
      WHERE fecha IS NOT NULL
        AND (
          source_table = 'transactions_raw'
          OR (
            transaction_group_id IS NULL
            AND NOT (
              movement_type IN ('BUY_USDT', 'SELL_USDT')
              AND flow_type = 'SETTLEMENT'
            )
            AND source_table NOT IN ('bingx_spot', 'trading_transfer')
          )
        )
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
      ${capitalMovementsCte()}
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
        ), 0) AS cumulative_net_contributions_usd
      FROM snapshots s
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
      ${capitalMovementsCte()}
      history AS (
        SELECT
          s.snapshot_date,
          COALESCE(s.total_with_trading_usd, s.market_value_usd) AS market_value_usd,
          s.market_value_ars,
          s.cost_value_usd,
          s.cost_value_ars,
          s.total_pnl_usd,
          s.total_pnl_ars,
          s.total_pnl_pct,
          s.investments_usd,
          s.investments_cost_usd,
          s.investments_cost_ars,
          s.liquidity_usd,
          s.crypto_usd,
          COALESCE(s.trading_retained_result_usd, 0) AS trading_retained_result_usd,
          COALESCE(s.total_with_trading_usd, s.market_value_usd) AS total_with_trading_usd,
          COALESCE((
            SELECT SUM(d.net_flow_usd)
            FROM daily_capital d
            WHERE d.fecha <= s.snapshot_date
          ), 0) AS cumulative_net_contributions_usd
        FROM ${table('portfolio_snapshots')} s
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
