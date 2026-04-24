const express = require('express');
const router = express.Router();
const {
  getSummary,
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
  getMarket,
  getHistory,
  getPlatformAllocation,
  getBenchmarkComparison,
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


module.exports = router;