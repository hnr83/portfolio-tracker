const { runQuery } = require("../repositories/bigqueryRepository");

async function snapshotPortfolioJob() {
  const query = `
    MERGE \`project-a4c11095-2051-4d2c-b3c.portfolio.portfolio_snapshots\` T
    USING (
      WITH portfolio AS (
        SELECT
          CURRENT_DATE() AS snapshot_date,

          SUM(CAST(market_value_usd AS FLOAT64)) AS market_value_usd,
          SUM(CAST(market_value_ars AS FLOAT64)) AS market_value_ars,

          SUM(CAST(cost_value_usd AS FLOAT64)) AS cost_value_usd,
          SUM(CAST(cost_value_ars AS FLOAT64)) AS cost_value_ars,

          SUM(
            CASE
              WHEN category = 'PORTFOLIO'
              THEN CAST(pnl_usd AS FLOAT64)
              ELSE 0
            END
          ) AS total_pnl_usd,

          SUM(
            CASE
              WHEN category = 'PORTFOLIO'
              THEN CAST(pnl_ars AS FLOAT64)
              ELSE 0
            END
          ) AS total_pnl_ars,

          SAFE_DIVIDE(
            SUM(
              CASE
                WHEN category = 'PORTFOLIO'
                THEN CAST(pnl_usd AS FLOAT64)
                ELSE 0
              END
            ),
            NULLIF(
              SUM(
                CASE
                  WHEN category = 'PORTFOLIO'
                  THEN CAST(cost_value_usd AS FLOAT64)
                  ELSE 0
                END
              ),
              0
            )
          ) AS total_pnl_pct,

          SUM(
            CASE
              WHEN category = 'PORTFOLIO'
              THEN CAST(market_value_usd AS FLOAT64)
              ELSE 0
            END
          ) AS investments_usd,

          SUM(
            CASE
              WHEN category = 'PORTFOLIO'
              THEN CAST(cost_value_usd AS FLOAT64)
              ELSE 0
            END
          ) AS investments_cost_usd,

          SUM(
            CASE
              WHEN category = 'PORTFOLIO'
              THEN CAST(cost_value_ars AS FLOAT64)
              ELSE 0
            END
          ) AS investments_cost_ars,

          SUM(
            CASE
              WHEN category IN ('CASH', 'FX')
              THEN CAST(market_value_usd AS FLOAT64)
              ELSE 0
            END
          ) AS liquidity_usd,

          SUM(
            CASE
              WHEN category = 'CRYPTO'
              THEN CAST(market_value_usd AS FLOAT64)
              ELSE 0
            END
          ) AS crypto_usd

        FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_portfolio_valued\`
      ),

      trading AS (
        SELECT
          CAST(retained_result_usd AS FLOAT64) AS trading_retained_result_usd
        FROM \`project-a4c11095-2051-4d2c-b3c.portfolio.vw_trading_summary\`
      )

      SELECT
        p.*,
        COALESCE(t.trading_retained_result_usd, 0) AS trading_retained_result_usd,
        COALESCE(p.market_value_usd, 0) + COALESCE(t.trading_retained_result_usd, 0)
          AS total_with_trading_usd
      FROM portfolio p
      CROSS JOIN trading t
    ) S
    ON T.snapshot_date = S.snapshot_date

    WHEN MATCHED THEN
      UPDATE SET
        market_value_usd = S.market_value_usd,
        market_value_ars = S.market_value_ars,
        cost_value_usd = S.cost_value_usd,
        cost_value_ars = S.cost_value_ars,
        total_pnl_usd = S.total_pnl_usd,
        total_pnl_ars = S.total_pnl_ars,
        total_pnl_pct = S.total_pnl_pct,
        investments_usd = S.investments_usd,
        investments_cost_usd = S.investments_cost_usd,
        investments_cost_ars = S.investments_cost_ars,
        liquidity_usd = S.liquidity_usd,
        crypto_usd = S.crypto_usd,
        trading_retained_result_usd = S.trading_retained_result_usd,
        total_with_trading_usd = S.total_with_trading_usd,
        created_at = CURRENT_TIMESTAMP()

    WHEN NOT MATCHED THEN
      INSERT (
        snapshot_date,
        market_value_usd,
        market_value_ars,
        cost_value_usd,
        cost_value_ars,
        total_pnl_usd,
        total_pnl_ars,
        total_pnl_pct,
        investments_usd,
        investments_cost_usd,
        investments_cost_ars,
        liquidity_usd,
        crypto_usd,
        trading_retained_result_usd,
        total_with_trading_usd,
        created_at
      )
      VALUES (
        S.snapshot_date,
        S.market_value_usd,
        S.market_value_ars,
        S.cost_value_usd,
        S.cost_value_ars,
        S.total_pnl_usd,
        S.total_pnl_ars,
        S.total_pnl_pct,
        S.investments_usd,
        S.investments_cost_usd,
        S.investments_cost_ars,
        S.liquidity_usd,
        S.crypto_usd,
        S.trading_retained_result_usd,
        S.total_with_trading_usd,
        CURRENT_TIMESTAMP()
      )
  `;

  await runQuery(query);
  return { ok: true };
}

module.exports = {
  snapshotPortfolioJob,
};