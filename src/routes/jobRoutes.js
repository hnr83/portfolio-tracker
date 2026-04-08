const express = require('express');
const router = express.Router();
const { runUpdatePrices } = require('../controllers/jobController');
const { updateFxRatesJob } = require('../jobs/updateFxRatesJob');

router.post('/update-fx', async (req, res) => {
  const result = await updateFxRatesJob();
  res.json(result);
});


router.post('/update-prices', runUpdatePrices);

module.exports = router;