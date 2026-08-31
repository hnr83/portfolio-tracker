CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET_ID}}.vw_market_prices_cedear` AS
WITH underlying_daily AS (
  SELECT
    CAST(ticker AS STRING) AS ticker,
    price_date,
    SAFE_CAST(market_price AS NUMERIC) AS market_price,
    CAST(currency AS STRING) AS currency,
    as_of_ts
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.vw_daily_latest_prices`
),

price_dates AS (
  SELECT DISTINCT price_date
  FROM underlying_daily
  WHERE price_date IS NOT NULL
),

ccl_daily_raw AS (
  SELECT
    DATE(as_of_ts, 'America/Argentina/Buenos_Aires') AS rate_date,
    SAFE_CAST(rate AS NUMERIC) AS cclars,
    as_of_ts
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.fx_rates`
  WHERE base_currency = 'USD'
    AND quote_currency = 'ARS_CCL'
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY DATE(as_of_ts, 'America/Argentina/Buenos_Aires')
    ORDER BY as_of_ts DESC
  ) = 1
),

ccl_by_price_date AS (
  SELECT
    d.price_date,
    r.cclars
  FROM price_dates d
  LEFT JOIN ccl_daily_raw r
    ON r.rate_date = d.price_date
),

ccl_filled AS (
  SELECT
    price_date,
    COALESCE(
      LAST_VALUE(cclars IGNORE NULLS) OVER (
        ORDER BY price_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ),
      FIRST_VALUE(cclars IGNORE NULLS) OVER (
        ORDER BY price_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
      )
    ) AS cclars_filled
  FROM ccl_by_price_date
),

cedear_daily AS (
  SELECT
    CAST(cm.internal_ticker AS STRING) AS internal_ticker,
    CAST(cm.underlying_ticker AS STRING) AS underlying_ticker,
    CAST(cm.ratio_text AS STRING) AS ratio_text,
    SAFE_CAST(cm.ratio_numerator AS NUMERIC) AS ratio_numerator,
    SAFE_CAST(cm.ratio_denominator AS NUMERIC) AS ratio_denominator,

    u.price_date,
    SAFE_CAST(u.market_price AS NUMERIC) AS underlying_price_usd,
    SAFE_CAST(ccl.cclars_filled AS NUMERIC) AS cclars,

    SAFE_DIVIDE(
      SAFE_CAST(u.market_price AS NUMERIC) * SAFE_CAST(cm.ratio_denominator AS NUMERIC),
      SAFE_CAST(cm.ratio_numerator AS NUMERIC)
    ) AS theoretical_price_usd_per_cedear,

    SAFE_DIVIDE(
      SAFE_CAST(u.market_price AS NUMERIC) * SAFE_CAST(cm.ratio_denominator AS NUMERIC),
      SAFE_CAST(cm.ratio_numerator AS NUMERIC)
    ) * SAFE_CAST(ccl.cclars_filled AS NUMERIC) AS theoretical_price_ars_per_cedear,

    u.as_of_ts AS underlying_fetched_at
  FROM `{{PROJECT_ID}}.{{DATASET_ID}}.cedear_master` cm
  LEFT JOIN underlying_daily u
    ON u.ticker = cm.underlying_ticker
  LEFT JOIN ccl_filled ccl
    ON ccl.price_date = u.price_date
  WHERE cm.is_active = TRUE
),

cedear_enriched AS (
  SELECT
    *,
    LAG(theoretical_price_ars_per_cedear) OVER (
      PARTITION BY internal_ticker
      ORDER BY price_date
    ) AS prev_price,

    LAG(price_date) OVER (
      PARTITION BY internal_ticker
      ORDER BY price_date
    ) AS prev_price_date
  FROM cedear_daily
),

latest AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY internal_ticker
      ORDER BY price_date DESC, underlying_fetched_at DESC
    ) AS rn
  FROM cedear_enriched
)

SELECT
  CAST(internal_ticker AS STRING) AS ticker,
  price_date,

  SAFE_CAST(theoretical_price_ars_per_cedear AS NUMERIC) AS market_price,
  'ARS' AS currency,
  'CEDEAR_THEORETICAL_CCL' AS source_table,
  underlying_fetched_at AS as_of_ts,

  prev_price_date,
  COALESCE(SAFE_CAST(prev_price AS NUMERIC), CAST(0 AS NUMERIC)) AS prev_market_price,

  SAFE_CAST(
    theoretical_price_ars_per_cedear
      - COALESCE(prev_price, theoretical_price_ars_per_cedear)
    AS NUMERIC
  ) AS change_1d,

  CASE
    WHEN prev_price IS NULL OR prev_price = 0 THEN CAST(0 AS NUMERIC)
    ELSE SAFE_DIVIDE(
      theoretical_price_ars_per_cedear - prev_price,
      prev_price
    )
  END AS change_pct_1d,

  TRUE AS is_cedear,

  CAST(underlying_ticker AS STRING) AS underlying_ticker,
  CAST(ratio_text AS STRING) AS ratio_text,
  SAFE_CAST(ratio_numerator AS NUMERIC) AS ratio_numerator,
  SAFE_CAST(ratio_denominator AS NUMERIC) AS ratio_denominator,
  SAFE_CAST(underlying_price_usd AS NUMERIC) AS underlying_price_usd,

  -- Keep the existing output contract: for CEDEAR rows this is now the
  -- effective FX used to construct the ARS price, i.e. CCL.
  SAFE_CAST(cclars AS NUMERIC) AS usdars

FROM latest
WHERE rn = 1;
