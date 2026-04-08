const axios = require('axios');

const BASE_URL = 'https://api.coingecko.com/api/v3';

async function fetchCoinGeckoPrices(items) {
  if (!items.length) return [];

  const ids = items.map(x => x.provider_symbol).join(',');
  const headers = {};

  if (process.env.COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = process.env.COINGECKO_API_KEY;
  }

  try {
    const response = await axios.get(`${BASE_URL}/simple/price`, {
      params: {
        ids,
        vs_currencies: 'usd',
      },
      headers,
      timeout: 15000,
    });

    const data = response.data || {};

    return items.map(item => {
      const row = data[item.provider_symbol];

      if (!row || row.usd == null) {
        return {
          ticker: item.internal_ticker,
          internal_ticker: item.internal_ticker,
          provider: 'COINGECKO',
          provider_symbol: item.provider_symbol,
          provider_exchange: null,
          success: false,
          error: 'No price returned',
        };
      }

      return {
        ticker: item.internal_ticker,
        internal_ticker: item.internal_ticker,
        provider: 'COINGECKO',
        provider_symbol: item.provider_symbol,
        provider_exchange: null,
        market_price: Number(row.usd),
        currency: 'USD',
        price_date: new Date().toISOString().slice(0, 10),
        as_of_ts: new Date().toISOString(),
        source_table: 'COINGECKO',
        success: true,
      };
    });
  } catch (error) {
    return items.map(item => ({
      ticker: item.internal_ticker,
      internal_ticker: item.internal_ticker,
      provider: 'COINGECKO',
      provider_symbol: item.provider_symbol,
      provider_exchange: null,
      success: false,
      error: error.response?.data?.error || error.message,
    }));
  }
}

module.exports = { fetchCoinGeckoPrices };