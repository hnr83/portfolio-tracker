const express = require('express');
const router = express.Router();
const {
  getSummary,
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
  getMarket,
} = require('../controllers/portfolioController');

router.get('/summary', getSummary);
router.get('/positions', getPositions);
router.get('/investments', getInvestments);
router.get("/holdings", getHoldings);
router.get("/movements", getMovements);
router.get("/market", getMarket);

module.exports = router;