require("dotenv").config();

const express = require("express");
const cors = require("cors");

const portfolioRoutes = require("./routes/portfolioRoutes");
const jobRoutes = require("./routes/jobRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const tradingRoutes = require("./routes/tradingRoutes");
const authRoutes = require("./routes/authRoutes");

const { requireAuth } = require("./middlewares/authMiddleware");
const { requireJobAuth } = require("./middlewares/jobAuthMiddleware");

const app = express();

console.log("ARRANCANDO APP...");

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://portfolio-tracker-jubilacion.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-cron-secret"],
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);

app.get("/api/jobs/test2", requireAuth, (req, res) => {
  res.json({ ok: true, route: "jobs-test2-direct" });
});

app.use("/api/portfolio", requireAuth, portfolioRoutes);
app.use("/api/jobs", requireJobAuth, jobRoutes);
app.use("/api/transactions", requireAuth, transactionRoutes);
app.use("/api/trading", requireAuth, tradingRoutes);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});