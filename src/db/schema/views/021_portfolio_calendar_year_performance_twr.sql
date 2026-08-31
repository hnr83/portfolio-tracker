CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET_ID}}.vw_portfolio_calendar_year_performance_twr` AS
WITH monthly AS (
  SELECT *
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.vw_portfolio_calendar_month_performance_adjusted`
),

first_snapshot_year AS (
  SELECT
    EXTRACT(YEAR FROM MIN(snapshot_date)) AS year
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.portfolio_snapshots`
  WHERE investments_usd IS NOT NULL
),

yearly AS (
  SELECT
    m.year,
    MIN(m.start_date) AS start_date,
    MAX(m.end_date) AS end_date,
    ARRAY_AGG(
      m.start_value_usd
      ORDER BY m.month ASC
      LIMIT 1
    )[OFFSET(0)] AS approx_start_value_usd,
    ARRAY_AGG(
      m.end_value_usd
      ORDER BY m.month DESC
      LIMIT 1
    )[OFFSET(0)] AS approx_end_value_usd,
    SUM(m.net_asset_flow_usd) AS net_asset_flow_usd,
    SUM(m.adjusted_pnl_usd) AS total_adjusted_pnl_usd,
    CASE
      WHEN m.year = ANY_VALUE(f.year) THEN NULL
      WHEN COUNTIF(m.adjusted_performance_pct IS NOT NULL) = 0 THEN NULL
      ELSE EXP(
        SUM(
          CASE
            WHEN m.adjusted_performance_pct > -0.999999
              THEN LN(1 + m.adjusted_performance_pct)
            ELSE NULL
          END
        )
      ) - 1
    END AS twr_performance_pct
  FROM monthly m
  CROSS JOIN first_snapshot_year f
  GROUP BY m.year
)

SELECT *
FROM yearly
ORDER BY year;
