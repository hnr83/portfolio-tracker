const { runQuery } = require('../services/bigQueryService');
const { table } = require('../utils/bigqueryHelper');

async function getNetContributionsHistory(req, res) {
  try {
    const range = (req.query.range || '6M').toUpperCase();

    let dateFilter = '';
    switch (range) {
      case '1M':
        dateFilter = 'snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)';
        break;
      case '3M':
        dateFilter = 'snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)';
        break;
      case '6M':
        dateFilter = 'snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)';
        break;
      case 'YTD':
        dateFilter = 'snapshot_date >= DATE_TRUNC(CURRENT_DATE(), YEAR)';
        break;
      case '1A':
        dateFilter = 'snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 YEAR)';
        break;
      case 'MAX':
      default:
        dateFilter = '1=1';
        break;
    }

    const query = `
      WITH capital_movements AS (
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

module.exports = {
  getNetContributionsHistory,
};
