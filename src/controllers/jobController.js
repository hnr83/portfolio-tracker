const { updatePricesJob } = require('../jobs/updatePricesJob');

async function runUpdatePrices(req, res) {
  try {
    const result = await updatePricesJob();
    res.json(result);
  } catch (error) {
    console.error('Error in runUpdatePrices:', error);
    res.status(500).json({
      error: 'Error updating prices',
      details: error.message,
    });
  }
}

module.exports = { runUpdatePrices };