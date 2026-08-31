const { insertRows } = require('../repositories/bigqueryRepository');
const axios = require('axios');

const TWELVE_API_KEY = process.env.TWELVE_DATA_API_KEY;
const CCL_URL = 'https://dolarapi.com/v1/dolares/contadoconliqui';

async function updateFxRatesJob() {
  try {
    console.log('Fetching USD/ARS and CCL FX rates...');

    const twelveUrl = `https://api.twelvedata.com/price?symbol=USD/ARS&apikey=${TWELVE_API_KEY}`;

    const [fxResponse, cclResponse] = await Promise.all([
      axios.get(twelveUrl),
      axios.get(CCL_URL),
    ]);

    if (!fxResponse.data || !fxResponse.data.price) {
      throw new Error('Invalid USD/ARS FX response');
    }

    const usdarsRate = parseFloat(fxResponse.data.price);

    const cclCompra = Number(cclResponse?.data?.compra);
    const cclVenta = Number(cclResponse?.data?.venta);

    if (!Number.isFinite(cclCompra) || !Number.isFinite(cclVenta)) {
      throw new Error('Invalid CCL FX response');
    }

    // Mid-market CCL is preferable for portfolio valuation: it avoids
    // introducing a bid/ask bias into CEDEAR theoretical prices.
    const cclRate = (cclCompra + cclVenta) / 2;

    const now = new Date().toISOString();
    const cclAsOfTs = cclResponse?.data?.fechaActualizacion || now;

    const rows = [
      {
        base_currency: 'USD',
        quote_currency: 'ARS',
        rate: usdarsRate,
        source: 'TWELVE_DATA',
        as_of_ts: now,
      },
      {
        base_currency: 'USD',
        // Keep CCL as a separate FX series so existing USD/ARS consumers
        // continue using the general rate unchanged.
        quote_currency: 'ARS_CCL',
        rate: cclRate,
        source: 'DOLARAPI_CCL',
        as_of_ts: cclAsOfTs,
      },
    ];

    await insertRows('portfolio', 'fx_rates', rows);

    console.log('FX rates inserted:', rows);

    return {
      ok: true,
      rate: usdarsRate,
      usdars_rate: usdarsRate,
      ccl_rate: cclRate,
      ccl_compra: cclCompra,
      ccl_venta: cclVenta,
    };
  } catch (error) {
    console.error('Error fetching FX rates:', error.message);

    return {
      ok: false,
      error: error.message,
    };
  }
}

module.exports = { updateFxRatesJob };
