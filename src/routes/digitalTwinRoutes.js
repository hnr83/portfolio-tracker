const express = require("express");
const { getInvestorProfile, saveInvestorProfile, getInvestorInterviewSession, guidedInvestorInterview } = require("../controllers/digitalTwinController");
const { auditedDecisionChat } = require("../controllers/digitalTwinAuditedChatController");
const { getTwinState, getTwinTracking } = require("../services/digitalTwinMemoryService");

const router = express.Router();
router.get("/investor-profile", getInvestorProfile);
router.put("/investor-profile", saveInvestorProfile);
router.get("/investor-profile/interview", getInvestorInterviewSession);
router.post("/investor-profile/interview", guidedInvestorInterview);
router.get("/state", getTwinState);
router.get("/tracking", getTwinTracking);
router.post("/chat", auditedDecisionChat);
module.exports = router;
