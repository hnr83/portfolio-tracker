const express = require("express");
const router = express.Router();

const {
  getTrading,
  getTradingSummary,
  getTradingByAsset,
  createTradingTrade,
  getBingxPositions,
  getBingxOrders,
  getBingxFillOrders,
  getBingxPositionHistoryBuilt,
  getTradingBalances,
  getTradingBalancesValued,
  createTradingRebalance,
  createTradingTransferToInvestment,
} = require("../controllers/tradingController");

const {
  getBingxFinalSyncPreview,
  syncBingxFinalTradesConfirm,
} = require("../controllers/bingxFinalSyncController");

router.get("/", getTrading);
router.get("/summary", getTradingSummary);
router.get("/by-asset", getTradingByAsset);
router.post("/", createTradingTrade);

router.get("/bingx/positions", getBingxPositions);
router.get("/bingx/orders", getBingxOrders);
router.get("/bingx/fill-orders", getBingxFillOrders);
router.get("/bingx/position-history-built", getBingxPositionHistoryBuilt);

// Same public endpoints: USDT-M + Coin-M, with Coin-M funding and Argentina dates corrected.
router.get("/bingx/sync-preview", getBingxFinalSyncPreview);
router.post("/bingx/sync-confirm", syncBingxFinalTradesConfirm);

router.get("/balances", getTradingBalances);
router.get("/balances-valued", getTradingBalancesValued);
router.post("/rebalance", createTradingRebalance);
router.post("/transfer-to-investment", createTradingTransferToInvestment);
module.exports = router;