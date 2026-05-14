const { runQuery } = require("../repositories/bigqueryRepository");
const { table } = require("../utils/bigqueryHelper");

async function rebuildPositionLotsJob() {
  const query = `
    CREATE OR REPLACE TABLE ${table("position_lots_fifo")}
    CLUSTER BY ticker, buy_year AS

    WITH asset_movements AS (
      SELECT
        id,
        fecha,
        ticker,
        movement_type,
        ABS(CAST(quantity AS FLOAT64)) AS quantity,

        CASE
          WHEN settlement_currency = 'USD'
            THEN ABS(CAST(net_amount AS FLOAT64))
          WHEN settlement_currency = 'ARS' AND fx_rate IS NOT NULL
            THEN ABS(CAST(net_amount AS FLOAT64)) / CAST(fx_rate AS FLOAT64)
          ELSE ABS(CAST(net_amount AS FLOAT64))
        END AS net_amount_usd,

        SAFE_DIVIDE(
          CASE
            WHEN settlement_currency = 'USD'
              THEN ABS(CAST(net_amount AS FLOAT64))
            WHEN settlement_currency = 'ARS' AND fx_rate IS NOT NULL
              THEN ABS(CAST(net_amount AS FLOAT64)) / CAST(fx_rate AS FLOAT64)
            ELSE ABS(CAST(net_amount AS FLOAT64))
          END,
          ABS(CAST(quantity AS FLOAT64))
        ) AS unit_price_usd

      FROM ${table("movements")}
      WHERE category = 'PORTFOLIO'
        AND movement_type IN ('BUY_ASSET', 'SELL_ASSET')
        AND ticker IS NOT NULL
        AND quantity IS NOT NULL
        AND CAST(quantity AS FLOAT64) != 0
    ),

    buys AS (
      SELECT
        id AS buy_movement_id,
        fecha AS buy_date,
        EXTRACT(YEAR FROM fecha) AS buy_year,
        ticker,
        quantity AS buy_quantity,
        unit_price_usd AS buy_unit_price_usd,
        net_amount_usd AS buy_amount_usd,

        SUM(quantity) OVER (
          PARTITION BY ticker
          ORDER BY fecha, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS buy_cum_before,

        SUM(quantity) OVER (
          PARTITION BY ticker
          ORDER BY fecha, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS buy_cum_after

      FROM asset_movements
      WHERE movement_type = 'BUY_ASSET'
    ),

    sells AS (
      SELECT
        id AS sell_movement_id,
        fecha AS sell_date,
        ticker,
        quantity AS sell_quantity,
        unit_price_usd AS sell_unit_price_usd,
        net_amount_usd AS sell_amount_usd,

        SUM(quantity) OVER (
          PARTITION BY ticker
          ORDER BY fecha, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS sell_cum_before,

        SUM(quantity) OVER (
          PARTITION BY ticker
          ORDER BY fecha, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS sell_cum_after

      FROM asset_movements
      WHERE movement_type = 'SELL_ASSET'
    ),

    fifo_allocations AS (
      SELECT
        b.ticker,
        b.buy_movement_id,
        b.buy_date,
        b.buy_year,
        b.buy_quantity,
        b.buy_unit_price_usd,
        b.buy_amount_usd,

        s.sell_movement_id,
        s.sell_date,
        s.sell_unit_price_usd,

        GREATEST(
          0,
          LEAST(
            COALESCE(b.buy_cum_after, b.buy_quantity),
            COALESCE(s.sell_cum_after, s.sell_quantity)
          )
          -
          GREATEST(
            COALESCE(b.buy_cum_before, 0),
            COALESCE(s.sell_cum_before, 0)
          )
        ) AS allocated_sell_quantity

      FROM buys b
      JOIN sells s
        ON s.ticker = b.ticker
       AND COALESCE(s.sell_cum_after, s.sell_quantity) > COALESCE(b.buy_cum_before, 0)
       AND COALESCE(s.sell_cum_before, 0) < COALESCE(b.buy_cum_after, b.buy_quantity)
    ),

    lot_summary AS (
      SELECT
        b.ticker,
        b.buy_movement_id,
        b.buy_date,
        b.buy_year,
        b.buy_quantity,
        b.buy_unit_price_usd,
        b.buy_amount_usd,

        COALESCE(SUM(f.allocated_sell_quantity), 0) AS sold_quantity,

        b.buy_quantity - COALESCE(SUM(f.allocated_sell_quantity), 0) AS remaining_quantity,

        COALESCE(
          SUM(f.allocated_sell_quantity * f.sell_unit_price_usd),
          0
        ) AS realized_proceeds_usd,

        COALESCE(
          SUM(f.allocated_sell_quantity * b.buy_unit_price_usd),
          0
        ) AS realized_cost_usd,

        COALESCE(
          SUM(
            f.allocated_sell_quantity
            * (f.sell_unit_price_usd - b.buy_unit_price_usd)
          ),
          0
        ) AS realized_pnl_usd,

        ARRAY_AGG(
          IF(
            f.sell_movement_id IS NULL,
            NULL,
            STRUCT(
              f.sell_movement_id,
              f.sell_date,
              f.allocated_sell_quantity,
              f.sell_unit_price_usd,
              f.allocated_sell_quantity * f.sell_unit_price_usd AS allocated_proceeds_usd,
              f.allocated_sell_quantity * b.buy_unit_price_usd AS allocated_cost_usd,
              f.allocated_sell_quantity * (f.sell_unit_price_usd - b.buy_unit_price_usd) AS allocated_pnl_usd
            )
          )
          IGNORE NULLS
          ORDER BY f.sell_date, f.sell_movement_id
        ) AS sell_allocations

      FROM buys b
      LEFT JOIN fifo_allocations f
        ON f.buy_movement_id = b.buy_movement_id
      GROUP BY
        b.ticker,
        b.buy_movement_id,
        b.buy_date,
        b.buy_year,
        b.buy_quantity,
        b.buy_unit_price_usd,
        b.buy_amount_usd
    )

    SELECT
      *,
      CURRENT_TIMESTAMP() AS rebuilt_at
    FROM lot_summary
  `;

  await runQuery(query);

  return {
    ok: true,
    message: "Position lots FIFO rebuilt successfully",
  };
}

module.exports = {
  rebuildPositionLotsJob,
};