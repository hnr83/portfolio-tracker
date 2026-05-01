const { runQuery } = require('./bigqueryRepository');

async function getPortfolioSummary() {
  const rows = await runQuery(`
    SELECT
      SUM(market_value_usd) AS total_market_usd,
      SUM(market_value_ars) AS total_market_ars,
      SUM(cost_value_usd) AS total_cost_usd,
      SUM(cost_value_ars) AS total_cost_ars,
      SUM(pnl_usd) AS total_pnl_usd,
      SUM(pnl_ars) AS total_pnl_ars,
      SAFE_DIVIDE(SUM(pnl_usd), NULLIF(SUM(cost_value_usd), 0)) * 100 AS total_pnl_pct
    FROM ${table('vw_portfolio_valued')} 
  `);

  return rows[0] || {};
}

async function getPortfolioPositions() {
  return runQuery(`
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
  `);
}

module.exports = {
  getPortfolioSummary,
  getPortfolioPositions,
};