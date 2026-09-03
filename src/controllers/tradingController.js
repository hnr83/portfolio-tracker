const { get } = require('../routes/portfolioRoutes');
const { runQuery } = require('../services/bigQueryService');
const { table } = require('../utils/bigqueryHelper');

const {
  getBingxSwapPositions,
  getBingxSwapAllOrders,
  getBingxSwapFillOrders,
  getBingxIncome,
} = require("../services/providers/bingxService");


async function getBingxPositions(req, res) {
  try {
    const { symbol } = req.query;

    const positions = await getBingxSwapPositions(symbol);

    res.json({
      provider: "BINGX",
      type: "PERPETUAL_FUTURES",
      positions,
    });
  } catch (err) {
    console.error("getBingxPositions error:", err);
    res.status(500).json({
      error: "Error obteniendo posiciones de BingX",
      detail: err.message,
    });
  }
}

async function getBingxOrders(req, res) {
  try {
    const { symbol, startTime, endTime, limit } = req.query;

    const orders = await getBingxSwapAllOrders({
      symbol,
      startTime,
      endTime,
      limit: limit ? Number(limit) : 100,
    });

    res.json({
      provider: "BINGX",
      type: "SWAP_ORDERS",
      orders,
    });
  } catch (err) {
    console.error("getBingxOrders error:", err);
    res.status(500).json({
      error: "Error obteniendo órdenes de BingX",
      detail: err.message,
    });
  }
}

async function getBingxFillOrders(req, res) {
  try {
    const { symbol, startTime, endTime, limit } = req.query;

    const fillOrders = await getBingxSwapFillOrders({
      symbol,
      startTime,
      endTime,
      limit: limit ? Number(limit) : 100,
    });

    res.json({
      provider: "BINGX",
      type: "SWAP_FILL_ORDERS",
      fillOrders,
    });
  } catch (err) {
    console.error("getBingxFillOrders error:", err);
    res.status(500).json({
      error: "Error obteniendo fills de BingX",
      detail: err.message,
    });
  }
}


function isBigQueryNumericObject(value) {
  return (
    value &&
    typeof value === "object" &&
    "s" in value &&
    "e" in value &&
    "c" in value &&
    Array.isArray(value.c)
  );
}

function bigQueryNumericObjectToString(value) {
  const sign = value.s === -1 ? "-" : "";
  const digits = value.c.join("");
  const exponent = Number(value.e);

  if (!digits) return "0";

  if (exponent < 0) {
    const zeros = Math.abs(exponent) - 1;
    return `${sign}0.${"0".repeat(zeros)}${digits}`;
  }

  const decimalPos = exponent + 1;

  if (digits.length <= decimalPos) {
    return `${sign}${digits}${"0".repeat(decimalPos - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`;
}

function unwrapBigQueryValue(value) {
  if (value && typeof value === "object" && "value" in value) {
    return unwrapBigQueryValue(value.value);
  }

  if (isBigQueryNumericObject(value)) {
    return bigQueryNumericObjectToString(value);
  }

  if (Array.isArray(value)) {
    return value.map(unwrapBigQueryValue);
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [key, innerValue] of Object.entries(value)) {
      out[key] = unwrapBigQueryValue(innerValue);
    }
    return out;
  }

  return value;
}

function normalizeBigQueryRows(rows = []) {
  return rows.map((row) => unwrapBigQueryValue(row));
}

async function getTrading(req, res) {
  try {
    const query = `
      SELECT *
      FROM ${table('vw_trading_trades_valued')}
      ORDER BY closed_at DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getTrading:", error);
    res.status(500).json({ error: "Error fetching trading data" });
  }
}

async function getTradingSummary(req, res) {
  try {
    const query = `
      SELECT *
      FROM ${table('vw_trading_summary')}
    `;

    const rows = await runQuery(query);
    const normalized = normalizeBigQueryRows(rows);

    res.json(normalized[0] || {});
  } catch (error) {
    console.error("Error in getTradingSummary:", error);
    res.status(500).json({ error: "Error fetching trading summary" });
  }
}

async function getTradingByAsset(req, res) {
  try {
    const query = `
      SELECT *
      FROM ${table('vw_trading_by_asset')}
      ORDER BY pnl_usd DESC
    `;

    const rows = await runQuery(query);
    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getTradingByAsset:", error);
    res.status(500).json({ error: "Error fetching trading by asset" });
  }
}

async function createTradingTrade(req, res) {
  try {
    const {
      instrument,
      direction,
      contract_type,
      settlement_asset,
      capital_usd,
      opened_at,
      closed_at,
      holding_days,
      entry_price,
      exit_price,
      leverage,
      pnl_pct,
      pnl_qty,
      exchange,
      is_capital_held,
      destination,
      notes,
    } = req.body;

    const cleanInstrument = String(instrument || "").toUpperCase();
    const cleanDirection = String(direction || "").toUpperCase();
    const requestedContractType = String(contract_type || "").toUpperCase();

    // contract_type y direction son conceptos independientes.
    // Si llega un cliente viejo sin contract_type, mantenemos la lógica histórica
    // para no romper altas anteriores: SHORT -> USD_MONEDA, LONG -> M_MONEDA.
    const contractType = ["USD_MONEDA", "M_MONEDA"].includes(requestedContractType)
      ? requestedContractType
      : cleanDirection === "SHORT"
        ? "USD_MONEDA"
        : "M_MONEDA";

    // El settlement depende del tipo de contrato, no de LONG/SHORT.
    // settlement_asset se recibe en el payload para que frontend/backend hablen
    // el mismo modelo, pero el servidor lo normaliza para evitar inconsistencias.
    const requestedSettlementAsset = String(settlement_asset || "").toUpperCase();
    const settlementAsset =
      contractType === "USD_MONEDA"
        ? "USDT"
        : requestedSettlementAsset && requestedSettlementAsset !== "USDT"
          ? requestedSettlementAsset
          : cleanInstrument;

    const finalDestination =
      destination ||
      (contractType === "USD_MONEDA" ? "HOLD_USDT" : "HOLD_COIN");

    const query = `
      INSERT INTO ${table('trading_trades_raw')}
      (
        trade_id,
        instrument,
        contract_type,
        settlement_asset,
        direction,
        capital_usd,
        opened_at,
        closed_at,
        holding_days,
        entry_price,
        exit_price,
        leverage,
        pnl_pct,
        pnl_qty,
        pnl_usd_reported,
        exchange,
        is_capital_held,
        destination,
        notes,
        source,
        created_at,
        updated_at
      )
      VALUES (
        GENERATE_UUID(),
        @instrument,
        @contract_type,
        @settlement_asset,
        @direction,
        @capital_usd,
        @opened_at,
        @closed_at,
        @holding_days,
        @entry_price,
        @exit_price,
        @leverage,
        @pnl_pct,
        @pnl_qty,
        NULL,
        @exchange,
        @is_capital_held,
        @destination,
        @notes,
        'manual_app',
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
    `;

    const params = {
      instrument: cleanInstrument,
      contract_type: contractType,
      settlement_asset: settlementAsset,
      direction: cleanDirection,
      capital_usd: Number(capital_usd || 0),
      opened_at,
      closed_at,
      holding_days: Number(holding_days || 0),
      entry_price: Number(entry_price || 0),
      exit_price: Number(exit_price || 0),
      leverage: Number(leverage || 1),
      pnl_pct: Number(pnl_pct || 0),
      pnl_qty: Number(pnl_qty || 0),
      exchange: exchange || "Bingx",
      is_capital_held: Boolean(is_capital_held),
      destination: finalDestination,
      notes: notes || null,
    };

    await runQuery(query, params);

    res.json({ ok: true });
  } catch (error) {
    console.error("Error in createTradingTrade:", error);
    res.status(500).json({ error: "Error creating trading trade" });
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDateString(ms) {
  const bingxMs = Number(ms);

  // BingX devuelve el timestamp como si fuera UTC,
  // pero la pantalla lo muestra en hora local. Ajustamos +3h para AR.
  const adjusted = new Date(bingxMs + 3 * 60 * 60 * 1000);

  return adjusted.toISOString().split("T")[0];
}

function toDateTime(ms) {
  return new Date(Number(ms)).toISOString();
}

function getInstrument(symbol) {
  return String(symbol || "")
    .replace("-USDT", "")
    .replace("USDT", "");
}

function getLeverage(value) {
  return toNumber(String(value || "").replace("X", ""));
}

function buildPositionHistoryFromOrders(orders = [], incomes = []) {
  const filledOrders = orders
    .filter((o) => o.status === "FILLED")
    .sort((a, b) => Number(a.time) - Number(b.time));

  const grouped = {};

  for (const order of filledOrders) {
    const key = `${order.symbol}_${order.positionSide}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  }

  const histories = [];

  for (const key of Object.keys(grouped)) {
    const list = grouped[key];

    let position = null;

    for (const order of list) {
      const isShort = order.positionSide === "SHORT";
      const qty = toNumber(order.executedQty);
      const quote = toNumber(order.cumQuote);
      const price = toNumber(order.avgPrice);

      const isOpen =
        (isShort && order.side === "SELL") ||
        (!isShort && order.side === "BUY");

      const isClose =
        (isShort && order.side === "BUY") ||
        (!isShort && order.side === "SELL");

      if (isOpen) {
        if (!position) {
          position = {
            symbol: order.symbol,
            instrument: getInstrument(order.symbol),
            direction: order.positionSide,
            open_time: order.time,
            entry_notional: 0,
            entry_qty: 0,
            entry_weighted_sum: 0,
            leverage: getLeverage(order.leverage),
            open_orders: [],
            close_orders: [],
          };
        }

        position.entry_notional += quote;
        position.entry_qty += qty;
        position.entry_weighted_sum += price * qty;
        position.open_orders.push(order);

        continue;
      }

      if (isClose && position) {
        position.close_orders.push(order);

        const closeQty = position.close_orders.reduce(
          (acc, o) => acc + toNumber(o.executedQty),
          0
        );

        const isFullyClosed = closeQty >= position.entry_qty * 0.999;

        if (isFullyClosed) {
          const entryPrice =
            position.entry_qty > 0
              ? position.entry_weighted_sum / position.entry_qty
              : 0;

          const closeTime = Number(order.time);


          // ======================
          // INCOMES CERCA DEL CIERRE
          // ======================
          const closeRelatedIncomes = incomes.filter((i) => {
            const sameSymbol =
              getInstrument(i.symbol) === getInstrument(position.symbol);

            const incomeTime = Number(i.time);

            return (
              sameSymbol &&
              Math.abs(incomeTime - closeTime) <= 10 * 60 * 1000
            );
          });

          // ======================
          // INCOMES DURANTE LA VIDA
          // ======================
          const periodIncomes = incomes.filter((i) => {
            const sameSymbol =
              getInstrument(i.symbol) === getInstrument(position.symbol);

            const incomeTime = Number(i.time);

            return (
              sameSymbol &&
              incomeTime >= Number(position.open_time) &&
              incomeTime <= closeTime + 10 * 60 * 1000
            );
          });

          console.log(
            "MATCHED CLOSE INCOMES",
            position.symbol,
            closeRelatedIncomes.map((i) => ({
              type: i.incomeType,
              income: i.income,
              time: i.time,
              iso: new Date(Number(i.time)).toISOString(),
            }))
          );

          // ======================
          // CLOSED PNL
          // ======================
          const closedPnl = closeRelatedIncomes
            .filter((i) =>
              String(i.incomeType || "")
                .toUpperCase()
                .includes("PNL")
            )
            .reduce((acc, i) => acc + toNumber(i.income), 0);

          // ======================
          // FUNDING
          // ======================
          const funding = periodIncomes
            .filter(
              (i) =>
                String(i.incomeType || "").toUpperCase() ===
                "FUNDING_FEE"
            )
            .reduce((acc, i) => acc + toNumber(i.income), 0);

          // ======================
          // COMMISSIONS
          // ======================
          const commissions = [
            ...position.open_orders,
            ...position.close_orders,
          ].reduce((acc, o) => acc + toNumber(o.commission), 0);

          // ======================
          // REALIZED PNL FINAL
          // ======================
          const realizedPnl =
            closedPnl +
            funding +
            commissions;

          console.log("FINAL PNL", {
            symbol: position.symbol,
            closedPnl,
            funding,
            commissions,
            realizedPnl,
          });

          

          const openDate = new Date(Number(position.open_time));
          const closeDate = new Date(closeTime);

          const holdingDays = Math.floor(
            (closeDate - openDate) / (1000 * 60 * 60 * 24)
          );

          histories.push({
            symbol: position.symbol,
            instrument: position.instrument,
            contract_type: isShort ? "USD_MONEDA" : "M_MONEDA",
            settlement_asset: isShort ? "USDT" : position.instrument,
            direction: position.direction,

            open_time: toDateTime(position.open_time),
            close_time: toDateTime(closeTime),

            opened_at: toDateString(position.open_time),
            closed_at: toDateString(closeTime),
            holding_days: holdingDays,

            entry_price: entryPrice,
            exit_price: toNumber(order.avgPrice),

            total_opened_usd: position.entry_notional,
            leverage: position.leverage,

            closed_pnl_usd: closedPnl,
            funding_fee_usd: funding,
            commissions_usd: commissions,
            realized_pnl_usd: realizedPnl,

            pnl_pct:
              position.entry_notional > 0
                ? realizedPnl / position.entry_notional
                : 0,

            exchange: "Bingx",
            is_capital_held: true,
            destination: isShort ? "HOLD_USDT" : "HOLD_COIN",
            source: "bingx_api_position_history",
            status: "FULLY_CLOSED",

            open_order_count: position.open_orders.length,
            close_order_count: position.close_orders.length,
          });

          position = null;
        }
      }
    }
  }

  return histories.sort(
    (a, b) => new Date(b.close_time) - new Date(a.close_time)
  );
}

async function getBingxPositionHistoryBuilt(req, res) {
  try {
    const { symbol, startTime, endTime, limit } = req.query;

    const maxWindowMs = 7 * 24 * 60 * 60 * 1000;

    const finalEndTime = endTime ? Number(endTime) : Date.now();
    const finalStartTime = startTime
      ? Number(startTime)
      : finalEndTime - maxWindowMs;

    let cursor = finalStartTime;
    let allOrders = [];
    let allIncomes = [];

    while (cursor < finalEndTime) {
      const windowEnd = Math.min(cursor + maxWindowMs - 1, finalEndTime);

      const ordersResult = await getBingxSwapAllOrders({
        symbol,
        startTime: cursor,
        endTime: windowEnd,
        limit: limit ? Number(limit) : 100,
      });

      const incomeResult = await getBingxIncome({
        symbol,
        startTime: cursor,
        endTime: windowEnd,
        limit: limit ? Number(limit) : 100,
      });

      const rawOrders = ordersResult?.orders || ordersResult || [];
      const rawIncomes =
        incomeResult?.income ||
        incomeResult?.incomes ||
        incomeResult?.list ||
        incomeResult ||
        [];

      allOrders = allOrders.concat(Array.isArray(rawOrders) ? rawOrders : []);
      allIncomes = allIncomes.concat(Array.isArray(rawIncomes) ? rawIncomes : []);

      cursor = windowEnd + 1;
    }

    console.log("ORDERS:", allOrders.length);
    console.log("INCOMES:", allIncomes.length);
    console.log("SAMPLE INCOME:", allIncomes[0]);
    const history = buildPositionHistoryFromOrders(allOrders, allIncomes);

    res.json({
      provider: "BINGX",
      type: "POSITION_HISTORY_BUILT",
      ordersCount: allOrders.length,
      incomeCount: allIncomes.length,
      count: history.length,
      history,
    });
  } catch (err) {
    console.error("getBingxPositionHistoryBuilt error:", err);
    res.status(500).json({
      error: "Error reconstruyendo Position History de BingX",
      detail: err.message,
    });
  }
}

function buildBingxTradeId(t) {
  return [
    "BINGX",
    t.symbol,
    t.direction,
    t.open_time,
    t.close_time,
  ].join("|");
}

function mapBingxHistoryToRawTrade(t) {
  const capitalUsd = Number(t.total_opened_usd || 0) / Number(t.leverage || 1);
  const realizedPnl = Number(t.realized_pnl_usd || 0);

  return {
    trade_id: buildBingxTradeId(t),
    instrument: t.instrument,
    contract_type: t.contract_type,
    settlement_asset: t.settlement_asset,
    direction: t.direction,
    capital_usd: capitalUsd,
    opened_at: t.opened_at,
    closed_at: t.closed_at,
    holding_days: Number(t.holding_days || 0),
    entry_price: Number(t.entry_price || 0),
    exit_price: Number(t.exit_price || 0),
    leverage: Number(t.leverage || 1),
    pnl_pct: capitalUsd > 0 ? realizedPnl / capitalUsd : 0,
    pnl_qty: realizedPnl,
    pnl_usd_reported: realizedPnl,
    exchange: "Bingx",
    is_capital_held: true,
    destination: t.direction === "SHORT" ? "HOLD_USDT" : "HOLD_COIN",
    notes: `closed_pnl=${t.closed_pnl_usd}; funding=${t.funding_fee_usd}; fees=${t.commissions_usd}`,
    source: "bingx_api_position_history",
  };
}

function validateBingxTradeForSync(row) {
  const reasons = [];

  if (!row.trade_id) reasons.push("missing_trade_id");
  if (!row.instrument) reasons.push("missing_instrument");
  if (!row.opened_at || !row.closed_at) reasons.push("missing_dates");
  if (!Number.isFinite(row.capital_usd) || row.capital_usd <= 0) {
    reasons.push("invalid_capital_usd");
  }

  if (!Number.isFinite(row.pnl_pct)) {
    reasons.push("invalid_pnl_pct");
  }

  if (Math.abs(Number(row.pnl_pct || 0)) > 2) {
    reasons.push("pnl_pct_too_high_possible_incomplete_trade");
  }

  return {
    isValid: reasons.length === 0,
    reasons,
  };
}

async function getExistingTradingTradeKeys() {
  const query = `
    SELECT
      instrument,
      contract_type,
      direction,
      CAST(closed_at AS STRING) AS closed_at
    FROM ${table('trading_trades_raw')}
    WHERE LOWER(exchange) IN ('bingx', 'binx')
      AND contract_type IN ('USD_MONEDA', 'M_MONEDA')
  `;

  const existingRows = await runQuery(query);

  return new Set(
    (existingRows || []).map((r) =>
      [
        String(r.instrument || "").toUpperCase(),
        String(r.contract_type || "").toUpperCase(),
        String(r.direction || "").toUpperCase(),
        String(r.closed_at || ""),
      ].join("|")
    )
  );
}

function buildLogicalTradeKey(row) {
  return [
    String(row.instrument || "").toUpperCase(),
    String(row.contract_type || "").toUpperCase(),
    String(row.direction || "").toUpperCase(),
    String(row.closed_at || ""),
  ].join("|");
}

async function getBingxSyncPreview(req, res) {
  try {
    const { symbol, lookbackDays, limit } = req.query;

    const days = Number(lookbackDays || 60);
    const finalEndTime = Date.now();
    const finalStartTime = finalEndTime - days * 24 * 60 * 60 * 1000;

    const maxWindowMs = 7 * 24 * 60 * 60 * 1000;

    let cursor = finalStartTime;
    let allOrders = [];
    let allIncomes = [];

    // 1) Traer orders por ventanas
    while (cursor < finalEndTime) {
      const windowEnd = Math.min(cursor + maxWindowMs - 1, finalEndTime);

      const ordersResult = await getBingxSwapAllOrders({
        symbol,
        startTime: cursor,
        endTime: windowEnd,
        limit: limit ? Number(limit) : 100,
      });

      const rawOrders = ordersResult?.orders || ordersResult || [];
      allOrders = allOrders.concat(Array.isArray(rawOrders) ? rawOrders : []);

      cursor = windowEnd + 1;
    }

    // 2) Detectar símbolos reales
    const symbols = symbol
      ? [symbol]
      : [...new Set(allOrders.map((o) => o.symbol).filter(Boolean))];

    // 3) Traer incomes por símbolo y por ventanas
    for (const currentSymbol of symbols) {
      let incomeCursor = finalStartTime;

      while (incomeCursor < finalEndTime) {
        const windowEnd = Math.min(incomeCursor + maxWindowMs - 1, finalEndTime);

        const incomeResult = await getBingxIncome({
          symbol: currentSymbol,
          startTime: incomeCursor,
          endTime: windowEnd,
          limit: limit ? Number(limit) : 100,
        });

        const rawIncomes =
          incomeResult?.income ||
          incomeResult?.incomes ||
          incomeResult?.list ||
          incomeResult ||
          [];

        allIncomes = allIncomes.concat(
          Array.isArray(rawIncomes) ? rawIncomes : []
        );

        incomeCursor = windowEnd + 1;
      }
    }

    const history = buildPositionHistoryFromOrders(allOrders, allIncomes);

    const mappedRows = history.map(mapBingxHistoryToRawTrade);

    const validatedRows = mappedRows.map((row) => {
      const validation = validateBingxTradeForSync(row);

      return {
        ...row,
        sync_valid: validation.isValid,
        sync_skip_reasons: validation.reasons,
      };
    });

    const cleanedRows = validatedRows.filter((r) => {
      // 1. Debe estar cerrado
      if (!r.closed_at) return false;

      // 2. Capital válido
      if (!Number.isFinite(r.capital_usd) || r.capital_usd <= 0) return false;

      // 3. PnL razonable
      if (Math.abs(Number(r.pnl_pct || 0)) > 2) return false;

      // 4. DESCARTAR trades sin closed pnl real
      // (caso bug que vimos)
      if (Math.abs(Number(r.pnl_usd_reported || 0)) < 0.01) return false;

      return true;
    });

    const validRows = cleanedRows.filter((r) => r.sync_valid);

    const existingKeys = await getExistingTradingTradeKeys();

    const rowsToInsert = validRows.filter(
      (r) => !existingKeys.has(buildLogicalTradeKey(r))
    );

    const alreadyExists = validRows.filter((r) =>
      existingKeys.has(buildLogicalTradeKey(r))
    );

    const skippedRows = validatedRows.filter((r) => !r.sync_valid);

    res.json({
      provider: "BINGX",
      type: "SYNC_PREVIEW",
      lookbackDays: days,
      ordersCount: allOrders.length,
      incomeCount: allIncomes.length,
      totalBuilt: history.length,
      validTrades: validRows.length,
      skippedTrades: skippedRows.length,
      alreadyExists: alreadyExists.length,
      newTrades: rowsToInsert.length,
      rowsToInsert,
      alreadyExistsRows: alreadyExists,
      skippedRows,
    });
  } catch (err) {
    console.error("getBingxSyncPreview error:", err);
    res.status(500).json({
      error: "Error generando preview de sync BingX",
      detail: err.message,
    });
  }
}

async function syncBingxTradesConfirm(req, res) {
  try {
    const { symbol, lookbackDays, limit } = req.query;

    const previewReq = {
      query: { symbol, lookbackDays, limit },
    };

    let previewPayload;

    const previewRes = {
      json: (data) => {
        previewPayload = data;
      },
      status: (code) => ({
        json: (data) => {
          throw new Error(data.detail || data.error || `Preview failed ${code}`);
        },
      }),
    };

    await getBingxSyncPreview(previewReq, previewRes);

    const rowsToInsert = previewPayload.rowsToInsert || [];

    const cleanRowsToInsert = rowsToInsert.map((r) => ({
      trade_id: r.trade_id,
      instrument: r.instrument,
      contract_type: r.contract_type,
      settlement_asset: r.settlement_asset,
      direction: r.direction,
      capital_usd: Number(r.capital_usd || 0),
      opened_at: r.opened_at,
      closed_at: r.closed_at,
      holding_days: Number(r.holding_days || 0),
      entry_price: Number(r.entry_price || 0),
      exit_price: Number(r.exit_price || 0),
      leverage: Number(r.leverage || 1),
      pnl_pct: Number(r.pnl_pct || 0),
      pnl_qty: Number(r.pnl_qty || 0),
      pnl_usd_reported: Number(r.pnl_usd_reported || 0),
      exchange: r.exchange || "Bingx",
      is_capital_held: Boolean(r.is_capital_held),
      destination: r.destination,
      notes: r.notes || null,
      source: r.source || "bingx_api_position_history",
    }));

    if (!rowsToInsert.length) {
      return res.json({
        ok: true,
        inserted: 0,
        message: "No hay trades nuevos para insertar",
        preview: previewPayload,
      });
    }

    const query = `
      INSERT INTO  ${table('trading_trades_raw')}
      (
        trade_id,
        instrument,
        contract_type,
        settlement_asset,
        direction,
        capital_usd,
        opened_at,
        closed_at,
        holding_days,
        entry_price,
        exit_price,
        leverage,
        pnl_pct,
        pnl_qty,
        pnl_usd_reported,
        exchange,
        is_capital_held,
        destination,
        notes,
        source,
        created_at,
        updated_at
      )
      SELECT
        trade_id,
        instrument,
        contract_type,
        settlement_asset,
        direction,
        capital_usd,
        DATE(opened_at),
        DATE(closed_at),
        holding_days,
        entry_price,
        exit_price,
        leverage,
        pnl_pct,
        pnl_qty,
        pnl_usd_reported,
        exchange,
        is_capital_held,
        destination,
        notes,
        source,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      FROM UNNEST(@rows)
    `;

    await runQuery(query, {
      rows: cleanRowsToInsert,
    });

    res.json({
      ok: true,
      inserted: cleanRowsToInsert.length,
      insertedRows: cleanRowsToInsert,
      preview: previewPayload,
    });
  } catch (err) {
    console.error("syncBingxTradesConfirm error:", err);
    res.status(500).json({
      error: "Error confirmando sync BingX",
      detail: err.message,
    });
  }
}

async function getTradingBalances(req, res) {
  try {
    const query = `
      SELECT *
      FROM ${table('vw_trading_asset_balances')}
      ORDER BY asset
    `;

    const rows = await runQuery(query);

    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getTradingBalances:", error);

    res.status(500).json({
      error: "Error fetching trading balances",
    });
  }
}

async function getTradingBalancesValued(req, res) {
  try {
    const query = `
      SELECT *
      FROM ${table('vw_trading_balances_valued')}
      ORDER BY asset
    `;

    const rows = await runQuery(query);

    res.json(normalizeBigQueryRows(rows));
  } catch (error) {
    console.error("Error in getTradingBalancesValued:", error);

    res.status(500).json({
      error: "Error fetching trading balances valued",
    });
  }
}


async function createTradingRebalance(req, res) {
  try {
    const {
      movement_date,
      exchange = "Bingx",
      from_asset,
      to_asset,
      from_quantity,
      to_quantity,
      amount_usd,
      notes,
    } = req.body;

    const cleanFromAsset = String(from_asset || "").toUpperCase();
    const cleanToAsset = String(to_asset || "").toUpperCase();

    const fromQty = Number(from_quantity || 0);
    const toQty = Number(to_quantity || 0);
    const amountUsd = Number(amount_usd || 0);

    if (!movement_date) {
      return res.status(400).json({ error: "movement_date es obligatorio" });
    }

    if (!cleanFromAsset || !cleanToAsset) {
      return res.status(400).json({ error: "from_asset y to_asset son obligatorios" });
    }

    if (cleanFromAsset === cleanToAsset) {
      return res.status(400).json({ error: "from_asset y to_asset no pueden ser iguales" });
    }

    if (fromQty <= 0 || toQty <= 0 || amountUsd <= 0) {
      return res.status(400).json({
        error: "from_quantity, to_quantity y amount_usd deben ser mayores a 0",
      });
    }

    const transferGroupId = `TRADING-REBALANCE-${Date.now()}`;

    const fromFxPriceUsd =
      cleanFromAsset === "USDT" ? 1 : amountUsd / fromQty;

    const toFxPriceUsd =
      cleanToAsset === "USDT" ? 1 : amountUsd / toQty;

    const query = `
      INSERT INTO ${table("trading_account_movements")}
      (
        movement_id,
        movement_date,
        movement_type,
        exchange,
        asset,
        quantity,
        amount_usd,
        fx_price_usd,
        transfer_group_id,
        notes,
        source,
        created_at
      )
      VALUES
      (
        GENERATE_UUID(),
        @movement_date,
        'CONVERT_OUT',
        @exchange,
        @from_asset,
        @from_quantity_signed,
        @from_amount_usd_signed,
        @from_fx_price_usd,
        @transfer_group_id,
        @notes,
        'manual_app_rebalance',
        CURRENT_TIMESTAMP()
      ),
      (
        GENERATE_UUID(),
        @movement_date,
        'CONVERT_IN',
        @exchange,
        @to_asset,
        @to_quantity,
        @to_amount_usd,
        @to_fx_price_usd,
        @transfer_group_id,
        @notes,
        'manual_app_rebalance',
        CURRENT_TIMESTAMP()
      )
    `;

    await runQuery(query, {
      movement_date,
      exchange,
      from_asset: cleanFromAsset,
      to_asset: cleanToAsset,
      from_quantity_signed: -Math.abs(fromQty),
      from_amount_usd_signed: -Math.abs(amountUsd),
      to_quantity: Math.abs(toQty),
      to_amount_usd: Math.abs(amountUsd),
      from_fx_price_usd: fromFxPriceUsd,
      to_fx_price_usd: toFxPriceUsd,
      transfer_group_id: transferGroupId,
      notes: notes || `Rebalance ${cleanFromAsset} a ${cleanToAsset}`,
    });

    res.status(201).json({
      ok: true,
      transfer_group_id: transferGroupId,
    });
  } catch (error) {
    console.error("Error in createTradingRebalance:", error);

    res.status(500).json({
      error: "Error creating trading rebalance",
      detail: error.message,
    });
  }
}

async function createTradingTransferToInvestment(req, res) {
  try {
    const {
      movement_date,
      exchange = "Bingx",
      asset,
      quantity,
      amount_usd,
      notes,
    } = req.body;

    const cleanAsset = String(asset || "").toUpperCase();
    const qty = Number(quantity || 0);
    const amountUsd = Number(amount_usd || 0);

    const portfolioTickerMap = {
      BTC: "CURRENCY:BTCARS",
      ETH: "CURRENCY:ETHARS",
      SOL: "CURRENCY:SOLARS",
    };

    const isUsdt = cleanAsset === "USDT";

    const portfolioTicker = portfolioTickerMap[cleanAsset] || cleanAsset;

    const portfolioInstrumentType = isUsdt
      ? "USDT"
      : portfolioTickerMap[cleanAsset]
        ? "ASSET"
        : cleanAsset;

    const portfolioMovementType = isUsdt
      ? "BUY_USDT"
      : "BUY_ASSET";

    const portfolioCategory = isUsdt
      ? "CRYPTO"
      : "PORTFOLIO";

    if (!movement_date) {
      return res.status(400).json({
        error: "movement_date es obligatorio",
      });
    }

    if (!cleanAsset) {
      return res.status(400).json({
        error: "asset es obligatorio",
      });
    }

    if (qty <= 0 || amountUsd <= 0) {
      return res.status(400).json({
        error: "quantity y amount_usd deben ser mayores a 0",
      });
    }

    const balanceQuery = `
      SELECT
        COALESCE(SUM(CAST(quantity AS NUMERIC)), 0) AS available
      FROM ${table("vw_trading_asset_balances")}
      WHERE exchange = @exchange
        AND asset = @asset
    `;

    const balanceRows = await runQuery(balanceQuery, {
      exchange,
      asset: cleanAsset,
    });

    const available = Number(balanceRows?.[0]?.available || 0);

    if (qty > available + 0.00000001) {
      return res.status(400).json({
        error: `Fondos insuficientes. Disponible ${available} ${cleanAsset}`,
      });
    }

    const transferGroupId = `TRADING-TO-INVESTMENT-${Date.now()}`;

    const fxPriceUsd =
      cleanAsset === "USDT"
        ? 1
        : amountUsd / qty;

    const finalNotes =
      notes || `Transfer ${cleanAsset} de trading a inversión`;

    // ---------------------------------------
    // 1. RESTAR DEL BALANCE DE TRADING
    // ---------------------------------------

    const tradingMovementQuery = `
      INSERT INTO ${table("trading_account_movements")}
      (
        movement_id,
        movement_date,
        movement_type,
        exchange,
        asset,
        quantity,
        amount_usd,
        fx_price_usd,
        transfer_group_id,
        notes,
        source,
        created_at
      )
      VALUES
      (
        GENERATE_UUID(),
        @movement_date,
        'TRANSFER_TO_INVESTMENT',
        @exchange,
        @asset,
        @quantity_signed,
        @amount_usd_signed,
        @fx_price_usd,
        @transfer_group_id,
        @notes,
        'manual_app_transfer_to_investment',
        CURRENT_TIMESTAMP()
      )
    `;

    await runQuery(tradingMovementQuery, {
      movement_date,
      exchange,
      asset: cleanAsset,
      quantity_signed: -Math.abs(qty),
      amount_usd_signed: -Math.abs(amountUsd),
      fx_price_usd: fxPriceUsd,
      transfer_group_id: transferGroupId,
      notes: finalNotes,
    });

    // ---------------------------------------
    // 2. AGREGAR AL PORTFOLIO / INVESTMENTS
    // ---------------------------------------

    const portfolioMovementQuery = `
      INSERT INTO ${table("movements")}
      (
        id,
        source_table,
        fecha,
        movement_type,
        category,
        owner,
        ticker,
        instrument_type,
        side,
        quantity,
        unit_price,
        price_currency,
        gross_amount,
        net_amount,
        settlement_currency,
        fx_rate,
        broker,
        description,
        raw_payload
      )
      VALUES
      (
        GENERATE_UUID(),
        'trading_transfer',
        @movement_date,
        @movement_type,
        @category,
        'Horacio',
        @portfolio_ticker,
        @portfolio_instrument_type,
        'BUY',
        @quantity,
        @fx_price_usd,
        'USD',
        @amount_usd,
        @amount_usd,
        'USD',
        NULL,
        @exchange,
        @notes,
        TO_JSON_STRING(
          STRUCT(
            'TRADING_TO_INVESTMENT' AS family,
            @movement_date AS fecha,
            @asset AS asset,
            @portfolio_ticker AS ticker,
            @quantity AS quantity,
            @amount_usd AS gross_amount,
            @fx_price_usd AS unit_price,
            @exchange AS broker,
            @notes AS description,
            @transfer_group_id AS transfer_group_id
          )
        )
      )
    `;

    await runQuery(portfolioMovementQuery, {
      movement_date,
      exchange,
      asset: cleanAsset,
      portfolio_ticker: portfolioTicker,
      portfolio_instrument_type: portfolioInstrumentType,
      movement_type: portfolioMovementType,
      category: portfolioCategory,
      quantity: qty,
      amount_usd: amountUsd,
      fx_price_usd: fxPriceUsd,
      transfer_group_id: transferGroupId,
      notes: finalNotes,
    });

    res.status(201).json({
      ok: true,
      transfer_group_id: transferGroupId,
      asset: cleanAsset,
      portfolio_ticker: portfolioTicker,
      category: portfolioCategory,
      movement_type: portfolioMovementType,
      instrument_type: portfolioInstrumentType,
      quantity: qty,
      amount_usd: amountUsd,
      fx_price_usd: fxPriceUsd,
      available_before: available,
    });
  } catch (error) {
    console.error(
      "Error in createTradingTransferToInvestment:",
      error
    );

    res.status(500).json({
      error: "Error creating trading transfer to investment",
      detail: error.message,
    });
  }
}

module.exports = {
  getTrading,
  getTradingSummary,
  getTradingByAsset,
  createTradingTrade,
  getBingxPositions,
  getBingxOrders,
  getBingxFillOrders,
  getBingxPositionHistoryBuilt,
  getBingxSyncPreview,
  syncBingxTradesConfirm,
  getTradingBalances,
  getTradingBalancesValued,
  createTradingRebalance,
  createTradingTransferToInvestment,
};
