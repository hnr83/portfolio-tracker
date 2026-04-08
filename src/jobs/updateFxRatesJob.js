const { insertRows } = require('../repositories/bigqueryRepository');
const axios = require('axios');

const TWELVE_API_KEY = process.env.TWELVE_DATA_API_KEY;

async function updateFxRatesJob() {
  try {
    console.log('Fetching USD/ARS FX rate...');

    const url = `https://api.twelvedata.com/price?symbol=USD/ARS&apikey=${TWELVE_API_KEY}`;

    const response = await axios.get(url);

    if (!response.data || !response.data.price) {
      throw new Error('Invalid FX response');
    }

    const rate = parseFloat(response.data.price);

    const now = new Date().toISOString();

    const row = {
      base_currency: 'USD',
      quote_currency: 'ARS',
      rate: rate,
      source: 'TWELVE_DATA',
      as_of_ts: now,
    };

    await insertRows('portfolio', 'fx_rates', [row]);

    console.log('FX rate inserted:', row);

    return {
      ok: true,
      rate: rate,
    };
  } catch (error) {
    console.error('Error fetching FX rate:', error.message);

    return {
      ok: false,
      error: error.message,
    };
  }
}

module.exports = { updateFxRatesJob };