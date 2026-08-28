const express = require("express");
const router = express.Router();
const {
  listScenarios,
  getScenario,
  getScenarioComparison,
  createScenario,
  deleteScenario,
} = require("../controllers/plannerController");

router.get("/scenarios", listScenarios);
router.get("/scenarios/:id/comparison", getScenarioComparison);
router.get("/scenarios/:id", getScenario);
router.post("/scenarios", createScenario);
router.delete("/scenarios/:id", deleteScenario);

module.exports = router;
