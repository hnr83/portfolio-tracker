CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET_ID}}.vw_portfolio_valued`
AS WITH positions AS (
  SELECT
    ticker,
    category,
    normalized_ticker,
    quantity_net,
    cost_net
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.vw_positions_normalized`
  WHERE quantity_net IS NOT NULL
    AND quantity_net <> 0
),

direct_prices AS (
  SELECT
    ticker,
    market_price,
    currency,
    source_table,
    price_date,
    as_of_ts
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.vw_latest_prices`
),

latest_fx AS (
  SELECT
    rate AS usdars
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.vw_latest_fx`
  WHERE base_currency = 'USD'
    AND quote_currency = 'ARS'
),

latest_ccl AS (
  SELECT
    rate AS cclars
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.vw_latest_fx`
  WHERE base_currency = 'USD'
    AND quote_currency = 'ARS_CCL'
),

cedear_prices AS (
  SELECT
    cm.internal_ticker AS ticker,
    cm.underlying_ticker,
    SAFE_CAST(cm.ratio_numerator AS FLOAT64) AS ratio_numerator,
    SAFE_CAST(cm.ratio_denominator AS FLOAT64) AS ratio_denominator,
    lp.market_price AS underlying_price_usd,
    fx.usdars,
    ccl.cclars,
    lp.market_price * ccl.cclars
      * SAFE_DIVIDE(
          SAFE_CAST(cm.ratio_denominator AS FLOAT64),
          SAFE_CAST(cm.ratio_numerator AS FLOAT64)
        ) AS cedear_price_ars
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.cedear_master` cm
  LEFT JOIN `{{PROJECT_ID}}.{{DATASET_ID}}.vw_latest_prices` lp
    ON cm.underlying_ticker = lp.ticker
  CROSS JOIN latest_fx fx
  CROSS JOIN latest_ccl ccl
  WHERE cm.is_active = TRUE
),

valued AS (
  SELECT
    p.ticker,
    p.category,
    p.normalized_ticker,
    p.quantity_net,
    p.cost_net,

    CASE
      WHEN p.normalized_ticker = 'USD' THEN 1
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN cp.cedear_price_ars
      ELSE dp.market_price
    END AS market_price,

    CASE
      WHEN p.normalized_ticker = 'USD' THEN 'USD'
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN 'ARS'
      ELSE dp.currency
    END AS price_currency,

    CASE
      WHEN p.normalized_ticker = 'USD' THEN 'FIXED_USD_1'
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN 'THEORETICAL_CEDEAR_CCL'
      ELSE dp.source_table
    END AS price_source,

    CASE
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN cp.underlying_ticker
      ELSE NULL
    END AS underlying_ticker,

    CASE
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN cp.ratio_numerator
      ELSE NULL
    END AS ratio_numerator,

    CASE
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN cp.ratio_denominator
      ELSE NULL
    END AS ratio_denominator,

    CASE
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN cp.underlying_price_usd
      ELSE NULL
    END AS underlying_price_usd,

    fx.usdars AS usdars,
    CASE
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN cp.cclars
      ELSE NULL
    END AS cclars,

    CASE
      WHEN p.normalized_ticker = 'USD' THEN p.quantity_net
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN p.quantity_net * cp.cedear_price_ars
      WHEN dp.currency = 'USD' THEN p.quantity_net * dp.market_price
      WHEN dp.currency = 'ARS' THEN p.quantity_net * dp.market_price
      ELSE NULL
    END AS market_value_native,

    CASE
      WHEN p.normalized_ticker = 'USD' THEN p.quantity_net
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN SAFE_DIVIDE(p.quantity_net * cp.cedear_price_ars, cp.cclars)
      WHEN dp.currency = 'USD' THEN p.quantity_net * dp.market_price
      WHEN dp.currency = 'ARS' THEN SAFE_DIVIDE(p.quantity_net * dp.market_price, fx.usdars)
      ELSE NULL
    END AS market_value_usd,

    CASE
      WHEN p.normalized_ticker = 'USD' THEN p.quantity_net * fx.usdars
      WHEN STARTS_WITH(p.normalized_ticker, 'BCBA:') THEN p.quantity_net * cp.cedear_price_ars
      WHEN dp.currency = 'USD' THEN p.quantity_net * dp.market_price * fx.usdars
      WHEN dp.currency = 'ARS' THEN p.quantity_net * dp.market_price
      ELSE NULL
    END AS market_value_ars

  FROM positions p
  LEFT JOIN direct_prices dp
    ON p.normalized_ticker = dp.ticker
  LEFT JOIN cedear_prices cp
    ON p.normalized_ticker = cp.ticker
  CROSS JOIN latest_fx fx
),

final AS (
  SELECT
    *,

    CASE
      WHEN normalized_ticker = 'USD' AND category = 'FX' THEN SAFE_DIVIDE(cost_net, usdars)
      WHEN normalized_ticker = 'USD' AND category = 'CASH' THEN cost_net
      WHEN normalized_ticker = 'USDT' THEN SAFE_DIVIDE(cost_net, usdars)
      WHEN STARTS_WITH(normalized_ticker, 'BCBA:') THEN cost_net
      WHEN price_currency = 'USD' THEN cost_net
      WHEN price_currency = 'ARS' THEN SAFE_DIVIDE(cost_net, usdars)
      ELSE NULL
    END AS cost_value_usd,

    CASE
      WHEN normalized_ticker = 'USD' AND category = 'FX' THEN cost_net
      WHEN normalized_ticker = 'USD' AND category = 'CASH' THEN cost_net * usdars
      WHEN normalized_ticker = 'USDT' THEN cost_net
      WHEN STARTS_WITH(normalized_ticker, 'BCBA:') THEN cost_net * usdars
      WHEN price_currency = 'USD' THEN cost_net * usdars
      WHEN price_currency = 'ARS' THEN cost_net
      ELSE NULL
    END AS cost_value_ars

  FROM valued
)

SELECT
  *,
  market_value_usd - cost_value_usd AS pnl_usd,
  market_value_ars - cost_value_ars AS pnl_ars,
  SAFE_DIVIDE(market_value_usd - cost_value_usd, NULLIF(cost_value_usd, 0)) AS pnl_pct
FROM final;
