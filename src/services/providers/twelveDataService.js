const axios = require('axios');

const BASE_URL = 'https://api.twelvedata.com';

async function fetchTwelveDataPrices(symbols) {
  if (!symbols.length) return [];

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('Missing TWELVE_DATA_API_KEY');
  }

  const results = [];

  for (const item of symbols) {
    try {
      const symbolParam = item.provider_exchange
        ? `${item.provider_symbol}:${item.provider_exchange}`
        : item.provider_symbol;

      const url = `${BASE_URL}/price`;
      const response = await axios.get(url, {
        params: {
          symbol: symbolParam,
          apikey: apiKey,
        },
        timeout: 15000,
      });

      const payload = response.data;

      if (!payload || payload.status === 'error' || payload.price == null) {
        results.push({
          ticker: item.internal_ticker,
          internal_ticker: item.internal_ticker,
          provider: 'TWELVE_DATA',
          provider_symbol: item.provider_symbol,
          provider_exchange: item.provider_exchange,
          success: false,
          error: payload?.message || 'No price returned',
        });
        continue;
      }

      results.push({
        ticker: item.internal_ticker,
        internal_ticker: item.internal_ticker,
        provider: 'TWELVE_DATA',
        provider_symbol: item.provider_symbol,
        provider_exchange: item.provider_exchange,
        market_price: Number(payload.price),
        currency: item.quote_currency || 'USD',
        price_date: new Date().toISOString().slice(0, 10),
        as_of_ts: new Date().toISOString(),
        source_table: 'TWELVE_DATA',
        success: true,
      });
    } catch (error) {
      results.push({
        ticker: item.internal_ticker,
        internal_ticker: item.internal_ticker,
        provider: 'TWELVE_DATA',
        provider_symbol: item.provider_symbol,
        provider_exchange: item.provider_exchange,
        success: false,
        error: error.response?.data?.message || error.message,
      });
    }
  }

  return results;
}

module.exports = { fetchTwelveDataPrices };