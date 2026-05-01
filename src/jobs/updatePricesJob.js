const { runQuery, insertRows } = require('../repositories/bigqueryRepository');
const { fetchTwelveDataPrices } = require('../services/providers/twelveDataService');
const { fetchCoinGeckoPrices } = require('../services/providers/coinGeckoService');
const { table } = require('../utils/bigqueryHelper');

async function updatePricesJob() {
  const tickers = await runQuery(`
    SELECT
      tm.internal_ticker,
      tm.asset_class,
      tm.provider,
      tm.provider_symbol,
      tm.provider_exchange,
      tm.quote_currency
    FROM ${table('ticker_master')} tm
    INNER JOIN (
      SELECT DISTINCT normalized_ticker
      FROM ${table('vw_positions_normalized')}
      WHERE quantity_net IS NOT NULL
        AND quantity_net <> 0
    ) p
      ON tm.internal_ticker = p.normalized_ticker
    WHERE tm.is_active = TRUE
      AND tm.asset_class IN ('STOCK', 'ETF', 'CRYPTO')
      AND NOT STARTS_WITH(tm.internal_ticker, 'BCBA:')
  `);

  const twelveDataItems = tickers.filter(
    t => t.provider === 'TWELVE_DATA'
  );

  const coinGeckoItems = tickers.filter(
    t => t.provider === 'COINGECKO'
  );

  console.log('Tickers total:', tickers.length);
  console.log('TwelveData:', twelveDataItems.length);
  console.log('CoinGecko:', coinGeckoItems.length);

  const promises = [];

  if (twelveDataItems.length > 0) {
    promises.push(fetchTwelveDataPrices(twelveDataItems));
  }

  if (coinGeckoItems.length > 0) {
    promises.push(fetchCoinGeckoPrices(coinGeckoItems));
  }

  const results = await Promise.all(promises);
  const allResults = results.flat();

  const invalidSuccessRows = allResults.filter(
    r =>
      r.success &&
      (!r.ticker || r.market_price === null || r.market_price === undefined)
  );

  if (invalidSuccessRows.length > 0) {
    console.error('Invalid successful price rows:', invalidSuccessRows);
  }

  const rowsToInsert = allResults
    .filter(
      r =>
        r.success &&
        r.ticker &&
        r.market_price !== null &&
        r.market_price !== undefined
    )
    .map(r => ({
      ticker: r.ticker,
      price_date: r.price_date,
      market_price: r.market_price,
      currency: r.currency,
      source_table: r.source_table,
      as_of_ts: r.as_of_ts,
    }));

  if (rowsToInsert.length === 0) {
    console.warn('No valid price rows to insert');
  } else {
    await insertRows('portfolio', 'prices', rowsToInsert);
  }

  console.log('Inserted:', rowsToInsert.length);

  return {
    ok: true,
    total_requested: tickers.length,
    sent_to_twelve_data: twelveDataItems.length,
    sent_to_coingecko: coinGeckoItems.length,
    inserted: rowsToInsert.length,
    errors: allResults.filter(r => !r.success),
    invalid_success_rows: invalidSuccessRows,
  };
}

module.exports = { updatePricesJob };