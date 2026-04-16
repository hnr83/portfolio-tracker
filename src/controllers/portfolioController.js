const { runQuery } = require('../services/bigQueryService');

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
        FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_portfolio_valued\`
        WHERE quantity_net > 0
          AND market_value_usd IS NOT NULL
      ),
      market_watch AS (
        SELECT
          *,
          ticker AS market_key
        FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_market_watch\`
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

module.exports = {
  getSummary,
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
  getMarket,
};