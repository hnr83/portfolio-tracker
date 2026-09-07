const express = require("express");
const { getInvestorProfile, saveInvestorProfile, guidedInvestorInterview } = require("../controllers/digitalTwinController");

const router = express.Router();

router.get("/investor-profile", getInvestorProfile);
router.put("/investor-profile", saveInvestorProfile);
router.post("/investor-profile/interview", guidedInvestorInterview);

module.exports = router;
