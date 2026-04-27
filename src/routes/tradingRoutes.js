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
  getBingxSyncPreview,
  syncBingxTradesConfirm,  
} = require("../controllers/tradingController");

router.get("/", getTrading);
router.get("/summary", getTradingSummary);
router.get("/by-asset", getTradingByAsset);
router.post("/", createTradingTrade);

router.get("/bingx/positions", getBingxPositions);
router.get("/bingx/orders", getBingxOrders);
router.get("/bingx/fill-orders", getBingxFillOrders);
router.get("/bingx/position-history-built", getBingxPositionHistoryBuilt);
router.get("/bingx/sync-preview", getBingxSyncPreview);
router.post("/bingx/sync-confirm", syncBingxTradesConfirm);

module.exports = router;