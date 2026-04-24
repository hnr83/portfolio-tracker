const express = require('express');
const router = express.Router();

const {
  runUpdatePrices,
  snapshotPortfolio,
  updateFx,
  updateBenchmarkPrices,
  backfillBenchmarkHistory,
} = require('../controllers/jobController');

router.post('/update-fx', updateFx);
router.post('/update-prices', runUpdatePrices);
router.post('/snapshot-portfolio', snapshotPortfolio);
router.post('/update-benchmark-prices', updateBenchmarkPrices);
router.post('/backfill-benchmark-history', backfillBenchmarkHistory);

module.exports = router;