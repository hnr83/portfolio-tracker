const express = require('express');
const router = express.Router();
const {
  getSummary,
  getPositions,
  getInvestments,
} = require('../controllers/portfolioController');

router.get('/summary', getSummary);
router.get('/positions', getPositions);
router.get('/investments', getInvestments);

module.exports = router;