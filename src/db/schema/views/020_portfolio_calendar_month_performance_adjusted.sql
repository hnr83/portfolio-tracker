CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET_ID}}.vw_portfolio_calendar_month_performance_adjusted` AS
WITH snapshots AS (
  SELECT
    snapshot_date,
    LAG(snapshot_date) OVER (ORDER BY snapshot_date) AS previous_snapshot_date,
    LAG(
      CAST(COALESCE(total_with_trading_usd, market_value_usd) AS FLOAT64)
    ) OVER (ORDER BY snapshot_date) AS start_value_usd,
    CAST(COALESCE(total_with_trading_usd, market_value_usd) AS FLOAT64) AS end_value_usd
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.portfolio_snapshots`
  WHERE COALESCE(total_with_trading_usd, market_value_usd) IS NOT NULL
),

capital_movements AS (
  SELECT
    id,
    fecha,
    CASE
      WHEN movement_type IN ('BUY_ASSET', 'SELL_ASSET')
        THEN ABS(SAFE_CAST(net_amount AS FLOAT64))
      WHEN movement_type IN ('BUY_USD', 'SELL_USD', 'BUY_USDT', 'SELL_USDT')
        THEN ABS(SAFE_CAST(quantity AS FLOAT64))
      WHEN movement_type IN ('INCOME_USD', 'EXPENSE_USD')
        THEN ABS(SAFE_CAST(net_amount AS FLOAT64))
      ELSE 0
    END AS amount_usd,
    CASE
      WHEN movement_type IN ('BUY_ASSET', 'BUY_USD', 'BUY_USDT', 'INCOME_USD') THEN 1
      WHEN movement_type IN ('SELL_ASSET', 'SELL_USD', 'SELL_USDT', 'EXPENSE_USD') THEN -1
      ELSE 0
    END AS sign
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.movements`
  WHERE fecha IS NOT NULL
    AND (
      source_table = 'transactions_raw'
      OR (
        transaction_group_id IS NULL
        AND NOT (
          movement_type IN ('BUY_USDT', 'SELL_USDT')
          AND flow_type = 'SETTLEMENT'
        )
        AND source_table NOT IN ('bingx_spot', 'trading_transfer')
      )
    )
),

interval_flows AS (
  SELECT
    s.snapshot_date,
    SUM(CASE WHEN m.sign = 1 THEN m.amount_usd ELSE 0 END) AS buys_usd,
    SUM(CASE WHEN m.sign = -1 THEN m.amount_usd ELSE 0 END) AS sells_usd,
    SUM(m.sign * m.amount_usd) AS net_asset_flow_usd,
    COUNT(m.id) AS movements_count
  FROM snapshots s
  LEFT JOIN capital_movements m
    ON m.fecha <= s.snapshot_date
   AND (
     s.previous_snapshot_date IS NULL
     OR m.fecha > s.previous_snapshot_date
   )
  GROUP BY s.snapshot_date
),

intervals AS (
  SELECT
    s.snapshot_date,
    s.previous_snapshot_date,
    EXTRACT(YEAR FROM s.snapshot_date) AS year,
    EXTRACT(MONTH FROM s.snapshot_date) AS month,
    DATE_TRUNC(s.snapshot_date, MONTH) AS month_date,
    s.start_value_usd,
    s.end_value_usd,
    COALESCE(f.buys_usd, 0) AS buys_usd,
    COALESCE(f.sells_usd, 0) AS sells_usd,
    COALESCE(f.net_asset_flow_usd, 0) AS net_asset_flow_usd,
    COALESCE(f.movements_count, 0) AS movements_count,
    s.end_value_usd
      - COALESCE(s.start_value_usd, 0)
      - COALESCE(f.net_asset_flow_usd, 0) AS adjusted_pnl_usd,
    CASE
      WHEN s.start_value_usd IS NULL OR s.start_value_usd = 0 THEN NULL
      ELSE SAFE_DIVIDE(
        s.end_value_usd
          - s.start_value_usd
          - COALESCE(f.net_asset_flow_usd, 0),
        s.start_value_usd
      )
    END AS interval_return
  FROM snapshots s
  LEFT JOIN interval_flows f
    ON f.snapshot_date = s.snapshot_date
),

monthly AS (
  SELECT
    year,
    month,
    month_date,
    MIN(COALESCE(previous_snapshot_date, snapshot_date)) AS start_date,
    MAX(snapshot_date) AS end_date,
    ARRAY_AGG(
      COALESCE(start_value_usd, 0)
      ORDER BY snapshot_date ASC
      LIMIT 1
    )[OFFSET(0)] AS start_value_usd,
    ARRAY_AGG(
      end_value_usd
      ORDER BY snapshot_date DESC
      LIMIT 1
    )[OFFSET(0)] AS end_value_usd,
    SUM(buys_usd) AS buys_usd,
    SUM(sells_usd) AS sells_usd,
    SUM(net_asset_flow_usd) AS net_asset_flow_usd,
    SUM(movements_count) AS movements_count,
    SUM(adjusted_pnl_usd) AS adjusted_pnl_usd,
    CASE
      WHEN COUNTIF(interval_return IS NOT NULL) = 0 THEN NULL
      ELSE EXP(
        SUM(
          CASE
            WHEN interval_return > -0.999999 THEN LN(1 + interval_return)
            ELSE NULL
          END
        )
      ) - 1
    END AS adjusted_performance_pct
  FROM intervals
  GROUP BY year, month, month_date
)

SELECT
  year,
  month,
  month_date,
  start_date,
  end_date,
  start_value_usd,
  end_value_usd,
  buys_usd,
  sells_usd,
  net_asset_flow_usd,
  movements_count,
  end_value_usd - start_value_usd AS gross_change_usd,
  adjusted_pnl_usd,
  adjusted_performance_pct,
  SAFE_DIVIDE(
    end_value_usd - start_value_usd,
    NULLIF(start_value_usd, 0)
  ) AS gross_performance_pct
FROM monthly
ORDER BY year, month;
