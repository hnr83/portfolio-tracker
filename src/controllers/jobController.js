const { updatePricesJob } = require('../jobs/updatePricesJob');
const { snapshotPortfolioJob } = require("../jobs/snapshotPortfolioJob");
const { updateFxRatesJob } = require("../jobs/updateFxRatesJob");
const { updateBenchmarkPricesJob, backfillBenchmarkHistoryJob } = require("../jobs/updateBenchmarkPricesJob");


async function updateFx(req, res) {
  try {
    const result = await updateFxRatesJob();
    res.json(result);
  } catch (error) {
    console.error("Error in updateFx:", error);
    res.status(500).json({ ok: false });
  }
}

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


async function snapshotPortfolio(req, res) {
  try {
    await snapshotPortfolioJob();

    res.json({
      ok: true,
      message: "Snapshot portfolio actualizado correctamente",
    });
  } catch (error) {
    console.error("Error in snapshotPortfolio:", error);
    res.status(500).json({
      ok: false,
      error: "Error actualizando portfolio_snapshots",
      details: error.message,
    });
  }
}

async function updateBenchmarkPrices(req, res) {
  try {
    const codes = Array.isArray(req.body?.codes) ? req.body.codes : [];
    const result = await updateBenchmarkPricesJob(codes);
    res.json(result);
  } catch (error) {
    console.error("Error updating benchmark prices:", error);
    res.status(500).json({ error: "Error updating benchmark prices" });
  }
}

async function backfillBenchmarkHistory(req, res) {
  try {
    const rawCodes = req.body?.codes;
    const codes = Array.isArray(rawCodes)
      ? rawCodes
      : typeof rawCodes === "string" && rawCodes.trim()
        ? [rawCodes]
        : [];

    const outputsize = Number(req.body?.outputsize || 365);

    const result = await backfillBenchmarkHistoryJob(codes, outputsize);
    res.json(result);
  } catch (error) {
    console.error("Error backfilling benchmark history:", error);
    res.status(500).json({ error: error.message || "Error backfilling benchmark history" });
  }
}

module.exports = {
  snapshotPortfolio,
  runUpdatePrices,
  updateFx,
  updateBenchmarkPrices,
  backfillBenchmarkHistory,
};