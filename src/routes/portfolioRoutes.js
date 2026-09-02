const express = require('express');
const router = express.Router();
const { getSummary } = require('../controllers/summaryController');
const {
  getNetContributionsHistory,
  getHistoryWithNetContributions,
} = require('../controllers/netContributionsController');
const {
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
  getMarket,
  getPlatformAllocation,
  getCustodyAudit,
  createCustodyTransfer,
  deleteCustodyTransfer,
  upsertCustodyBrokerAlias,
  deleteCustodyBrokerAlias,
  upsertCustodyOwnerAssignment,
  deleteCustodyOwnerAssignment,
  getBenchmarkComparison,
  getAssetPerformance,
  getHistoricalPerformance,
  getVintageReturns,
  getDecisionMaker,
  getBingxSpotDebug,
  getBingxSpotSyncPreview,
  syncBingxSpotConfirm,
  getAssetDetail,
} = require('../controllers/portfolioController');

router.get('/summary', getSummary);
router.get('/positions', getPositions);
router.get('/investments', getInvestments);
router.get("/holdings", getHoldings);
router.get("/assets/:ticker/detail", getAssetDetail);
router.get("/movements", getMovements);
router.get("/market", getMarket);
router.get("/history", getHistoryWithNetContributions);
router.get("/net-contributions-history", getNetContributionsHistory);
router.get("/platform-allocation", getPlatformAllocation);
router.get("/custody-audit", getCustodyAudit);
router.post("/custody-transfers", createCustodyTransfer);
router.delete("/custody-transfers/:id", deleteCustodyTransfer);
router.post("/custody-broker-aliases", upsertCustodyBrokerAlias);
router.delete("/custody-broker-aliases/:id", deleteCustodyBrokerAlias);
router.post("/custody-owner-assignments", upsertCustodyOwnerAssignment);
router.delete("/custody-owner-assignments/:id", deleteCustodyOwnerAssignment);
router.get("/benchmark", getBenchmarkComparison);
router.get("/performance",getAssetPerformance);
router.get("/historical-performance", getHistoricalPerformance);
router.get("/vintage-returns", getVintageReturns);
router.get("/decision-maker", getDecisionMaker);
router.get("/bingx-spot/debug", getBingxSpotDebug);
router.get("/bingx-spot/sync-preview", getBingxSpotSyncPreview);
router.post("/bingx-spot/sync-confirm", syncBingxSpotConfirm);

module.exports = router;
