const express = require("express");
const { getInvestorProfile, saveInvestorProfile, getInvestorInterviewSession, guidedInvestorInterview } = require("../controllers/digitalTwinController");

const router = express.Router();

router.get("/investor-profile", getInvestorProfile);
router.put("/investor-profile", saveInvestorProfile);
router.get("/investor-profile/interview", getInvestorInterviewSession);
router.post("/investor-profile/interview", guidedInvestorInterview);

module.exports = router;
