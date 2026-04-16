const { runQuery } = require('../services/bigQueryService');

function unwrapBigQueryValue(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
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
      WHERE market_value_usd IS NOT NULL
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
      FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_portfolio_valued\`
      ORDER BY market_value_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
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
    const safeLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 500)
        : 200;

    const whereSql = whereClauses.length
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

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
      FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.movements\`
      ${whereSql}
      ORDER BY fecha DESC
      LIMIT ${safeLimit}
    `;

    const rows = await runQuery(query, params);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error('Error in getMovements:', error.message);
    console.error(error);
    res.status(500).json({ error: 'Error fetching movements' });
  }
}

module.exports = {
  getSummary,
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
};