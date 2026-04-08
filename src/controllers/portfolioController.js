const { runQuery } = require('../services/bigQueryService');

async function getSummary(req, res) {
  try {
    const query = `
      SELECT
        SUM(market_value_usd) AS total_market_usd,
        SUM(market_value_ars) AS total_market_ars,
        SUM(cost_value_usd) AS total_cost_usd,
        SUM(cost_value_ars) AS total_cost_ars,
        SUM(pnl_usd) AS total_pnl_usd,
        SUM(pnl_ars) AS total_pnl_ars,
        SAFE_DIVIDE(SUM(pnl_usd), NULLIF(SUM(cost_value_usd), 0)) AS total_pnl_pct
      FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_portfolio_valued\`
    `;
    const rows = await runQuery(query);
    res.json(rows[0] || {});
  } catch (error) {
    console.error('Error in getSummary:', error);
    res.status(500).json({ error: 'Error fetching portfolio summary' });
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
      FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_portfolio_valued\`
      ORDER BY market_value_usd DESC
    `;
    const rows = await runQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error in getPositions:', error);
    res.status(500).json({ error: 'Error fetching positions' });
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
      FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_portfolio_valued\`
      WHERE category NOT IN ('CASH', 'FX')
      ORDER BY market_value_usd DESC
    `;
    const rows = await runQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error in getInvestments:', error);
    res.status(500).json({ error: 'Error fetching investments' });
  }
}

module.exports = {
  getSummary,
  getPositions,
  getInvestments,
};