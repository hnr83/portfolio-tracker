const express = require('express');
const router = express.Router();
const {
  getSummary,
  getPositions,
  getInvestments,
  getHoldings,
  getMovements,
} = require('../controllers/portfolioController');

router.get('/summary', getSummary);
router.get('/positions', getPositions);
router.get('/investments', getInvestments);
router.get("/holdings", getHoldings);
router.get("/movements", getMovements);

module.exports = router;