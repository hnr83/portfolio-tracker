require('dotenv').config();
const express = require('express');
const cors = require('cors');

const portfolioRoutes = require('./routes/portfolioRoutes');
const jobRoutes = require('./routes/jobRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const tradingRoutes = require('./routes/tradingRoutes');

const app = express();

console.log("ARRANCANDO APP...");

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API funcionando 🚀');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/jobs/test2', (req, res) => {
  res.json({ ok: true, route: 'jobs-test2-direct' });
});

app.use('/api/portfolio', portfolioRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/transactions', transactionRoutes);
app.use("/api/trading", tradingRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});