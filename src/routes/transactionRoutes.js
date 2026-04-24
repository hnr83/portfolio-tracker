const express = require("express");
const router = express.Router();
const { createTransaction, previewTransaction} = require("../controllers/transactionController");

router.post("/preview", previewTransaction);
router.post("/", createTransaction);

module.exports = router;