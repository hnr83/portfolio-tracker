const express = require("express");
const { getInvestorProfile, saveInvestorProfile } = require("../controllers/digitalTwinController");

const router = express.Router();

router.get("/investor-profile", getInvestorProfile);
router.put("/investor-profile", saveInvestorProfile);

module.exports = router;
