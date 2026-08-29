const express = require('express');
const router = express.Router();
const { getSummary } = require('../controllers/summaryController');
const {
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
  getMarket,
  getHistory,
  getPlatformAllocation,
  getBenchmarkComparison,
  getAssetPerformance,
  getHistoricalPerformance,
  getVintageReturns,
  getDecisionMaker,
  getBingxSpotDebug,
  getBingxSpotSyncPreview,
  syncBingxSpotConfirm,
} = require('../controllers/portfolioController');

router.get('/summary', getSummary);
router.get('/positions', getPositions);
router.get('/investments', getInvestments);
router.get("/holdings", getHoldings);
router.get("/movements", getMovements);
router.get("/market", getMarket);
router.get("/history", getHistory);
router.get("/platform-allocation", getPlatformAllocation);
router.get("/benchmark", getBenchmarkComparison);
router.get("/performance",getAssetPerformance);
router.get("/historical-performance", getHistoricalPerformance);
router.get("/vintage-returns", getVintageReturns);
router.get("/decision-maker", getDecisionMaker);
router.get("/bingx-spot/debug", getBingxSpotDebug);
router.get("/bingx-spot/sync-preview", getBingxSpotSyncPreview);
router.post("/bingx-spot/sync-confirm", syncBingxSpotConfirm);

module.exports = router;