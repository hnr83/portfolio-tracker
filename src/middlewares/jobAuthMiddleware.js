const { requireAuth } = require("./authMiddleware");

function requireJobAuth(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers["x-cron-secret"];

  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return next();
  }

  return requireAuth(req, res, next);
}

module.exports = { requireJobAuth };