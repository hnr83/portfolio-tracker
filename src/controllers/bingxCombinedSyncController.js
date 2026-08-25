const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");
const {
  getBingxCoinMOrderHistory,
  getBingxCoinMFillOrders,
  getBingxCoinMLeverage,
} = require("../services/providers/bingxService");
const {
  getBingxSyncPreview: getUsdtMSyncPreview,
} = require("./tradingController");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateString(ms) {
  // Keep the same date convention currently used by tradingController.
  const adjusted = new Date(Number(ms) + 3 * 60 * 60 * 1000);
  return adjusted.toISOString().split("T")[0];
}

function getCoinMInstrument(symbol) {
  return String(symbol || "")
    .toUpperCase()
    .replace(/-USD$/, "")
    .replace(/USD$/, "");
}

function normalizeCoinMStatus(status) {
  return String(status || "").toUpperCase();
}

function extractOrders(result) {
  const raw = result?.orders || result?.list || result || [];
  return Array.isArray(raw) ? raw : [];
}

function extractFills(result) {
  const raw = result?.fills || result?.list || result || [];
  return Array.isArray(raw) ? raw : [];
}

function buildLogicalTradeKey(row) {
  return [
    String(row.instrument || "").toUpperCase(),
    String(row.contract_type || "").toUpperCase(),
    String(row.direction || "").toUpperCase(),
    String(row.closed_at || ""),
  ].join("|");
}

async function getExistingCoinMKeys() {
  const query = `
    SELECT
      instrument,
      contract_type,
      direction,
      CAST(closed_at AS STRING) AS closed_at
    FROM ${table("trading_trades_raw")}
    WHERE LOWER(exchange) IN ('bingx', 'binx')
      AND contract_type = 'M_MONEDA'
  `;

  const rows = await runQuery(query);
  return new Set((rows || []).map(buildLogicalTradeKey));
}

async function callUsdtMPreview(query) {
  let payload;
  let failure;

  const mockReq = { query };
  const mockRes = {
    json: (data) => {
      payload = data;
      return data;
    },
    status: (code) => ({
      json: (data) => {
        failure = new Error(data?.detail || data?.error || `USDT-M preview failed ${code}`);
        return data;
      },
    }),
  };

  await getUsdtMSyncPreview(mockReq, mockRes);
  if (failure) throw failure;
  return payload || {};
}

async function fetchCoinMData({ startTime, endTime, limit }) {
  const maxWindowMs = 7 * 24 * 60 * 60 * 1000;
  let cursor = startTime;
  let allOrders = [];

  while (cursor < endTime) {
    const windowEnd = Math.min(cursor + maxWindowMs - 1, endTime);
    const result = await getBingxCoinMOrderHistory({
      startTime: cursor,
      endTime: windowEnd,
      limit,
    });

    allOrders = allOrders.concat(extractOrders(result));
    cursor = windowEnd + 1;
  }

  // orderHistory may overlap at window boundaries; orderId is stable.
  const uniqueOrders = Array.from(
    new Map(
      allOrders
        .filter((o) => o?.orderId)
        .map((o) => [String(o.orderId), o])
    ).values()
  );

  const filledOrders = uniqueOrders.filter(
    (o) => normalizeCoinMStatus(o.status) === "FILLED" && toNumber(o.executedQty) > 0
  );

  const fillsByOrder = new Map();
  for (const order of filledOrders) {
    // Coin-M requires orderId to retrieve fills. Keep requests sequential to stay
    // comfortably below BingX's 5 req/s UID limit.
    await sleep(220);
    const result = await getBingxCoinMFillOrders({
      orderId: String(order.orderId),
      pageIndex: 1,
      pageSize: 1000,
    });
    fillsByOrder.set(String(order.orderId), extractFills(result));
  }

  return { orders: filledOrders, fillsByOrder };
}

async function getCoinMLeverageMap(orders) {
  const symbols = [...new Set(orders.map((o) => o.symbol).filter(Boolean))];
  const result = new Map();

  for (const symbol of symbols) {
    try {
      await sleep(220);
      const leverage = await getBingxCoinMLeverage(symbol);
      result.set(symbol, leverage || {});
    } catch (err) {
      // Historical trades can still be imported if leverage lookup is unavailable.
      console.warn("BingX Coin-M leverage lookup failed", symbol, err.message);
      result.set(symbol, {});
    }
  }

  return result;
}

function buildCoinMTrades(orders, fillsByOrder, leverageBySymbol) {
  const grouped = {};

  for (const order of orders) {
    const positionSide = String(order.positionSide || "").toUpperCase();
    if (!["LONG", "SHORT"].includes(positionSide)) continue;

    const key = `${order.symbol}_${positionSide}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  }

  const trades = [];

  for (const list of Object.values(grouped)) {
    list.sort((a, b) => Number(a.time) - Number(b.time));
    let position = null;

    for (const order of list) {
      const direction = String(order.positionSide).toUpperCase();
      const side = String(order.side || "").toUpperCase();
      const isShort = direction === "SHORT";
      const isOpen = (isShort && side === "SELL") || (!isShort && side === "BUY");
      const isClose = (isShort && side === "BUY") || (!isShort && side === "SELL");
      const fills = fillsByOrder.get(String(order.orderId)) || [];

      const executedQty = fills.length
        ? fills.reduce((sum, f) => sum + toNumber(f.volume), 0)
        : toNumber(order.executedQty);

      const orderNotionalUsd = fills.reduce(
        (sum, f) => sum + Math.abs(toNumber(f.amount)),
        0
      );

      const weightedPriceNumerator = fills.reduce(
        (sum, f) => sum + toNumber(f.tradePrice) * toNumber(f.volume),
        0
      );
      const avgPrice = executedQty > 0 && weightedPriceNumerator > 0
        ? weightedPriceNumerator / executedQty
        : toNumber(order.avgPrice);

      if (isOpen) {
        if (!position) {
          const leverageInfo = leverageBySymbol.get(order.symbol) || {};
          const leverage = isShort
            ? toNumber(leverageInfo.shortLeverage)
            : toNumber(leverageInfo.longLeverage);

          position = {
            symbol: order.symbol,
            instrument: getCoinMInstrument(order.symbol),
            direction,
            openTime: Number(order.time),
            entryQty: 0,
            entryNotionalUsd: 0,
            entryWeightedPrice: 0,
            leverage: leverage || 1,
            openOrders: [],
            closeOrders: [],
          };
        }

        position.entryQty += executedQty;
        position.entryNotionalUsd += orderNotionalUsd;
        position.entryWeightedPrice += avgPrice * executedQty;
        position.openOrders.push({ order, fills });
        continue;
      }

      if (!isClose || !position) continue;

      position.closeOrders.push({ order, fills });
      const closeQty = position.closeOrders.reduce(
        (sum, item) => sum + item.fills.reduce((s, f) => s + toNumber(f.volume), 0),
        0
      ) || position.closeOrders.reduce(
        (sum, item) => sum + toNumber(item.order.executedQty),
        0
      );

      if (closeQty < position.entryQty * 0.999) continue;

      const allFills = [
        ...position.openOrders.flatMap((item) => item.fills),
        ...position.closeOrders.flatMap((item) => item.fills),
      ];
      const closeFills = position.closeOrders.flatMap((item) => item.fills);

      const settlementAsset =
        String(allFills.find((f) => f.currency)?.currency || position.instrument).toUpperCase();

      const realizedPnlCoin = allFills.reduce(
        (sum, f) => sum + toNumber(f.realizedPnl),
        0
      );
      const commissionCoin = allFills.reduce(
        (sum, f) => sum + toNumber(f.commission),
        0
      );
      const netPnlCoin = realizedPnlCoin + commissionCoin;

      const closeWeightedNumerator = closeFills.reduce(
        (sum, f) => sum + toNumber(f.tradePrice) * toNumber(f.volume),
        0
      );
      const closeFillQty = closeFills.reduce(
        (sum, f) => sum + toNumber(f.volume),
        0
      );

      const entryPrice = position.entryQty > 0
        ? position.entryWeightedPrice / position.entryQty
        : 0;
      const exitPrice = closeFillQty > 0
        ? closeWeightedNumerator / closeFillQty
        : toNumber(order.avgPrice);

      // Fill amount is the contract notional in USD. If BingX omits it, infer
      // from the Coin-M contract count used by the UI (BTCUSD = 100 USD/contract).
      const totalOpenedUsd = position.entryNotionalUsd > 0
        ? position.entryNotionalUsd
        : position.entryQty * 100;
      const capitalUsd = totalOpenedUsd / Math.max(position.leverage, 1);
      const pnlUsdAtClose = netPnlCoin * exitPrice;
      const closeTime = Number(order.updateTime || order.time);
      const holdingDays = Math.floor(
        (closeTime - position.openTime) / (24 * 60 * 60 * 1000)
      );

      trades.push({
        trade_id: [
          "BINGX-COINM",
          position.symbol,
          position.direction,
          position.openTime,
          closeTime,
        ].join("|"),
        instrument: position.instrument,
        contract_type: "M_MONEDA",
        settlement_asset: settlementAsset,
        direction: position.direction,
        capital_usd: capitalUsd,
        opened_at: toDateString(position.openTime),
        closed_at: toDateString(closeTime),
        holding_days: holdingDays,
        entry_price: entryPrice,
        exit_price: exitPrice,
        leverage: position.leverage,
        pnl_pct: capitalUsd > 0 ? pnlUsdAtClose / capitalUsd : 0,
        pnl_qty: netPnlCoin,
        pnl_usd_reported: pnlUsdAtClose,
        exchange: "Bingx",
        is_capital_held: true,
        destination: "HOLD_COIN",
        notes: `coin_m; realized_pnl=${realizedPnlCoin} ${settlementAsset}; fees=${commissionCoin} ${settlementAsset}`,
        source: "bingx_coinm_api_position_history",
        sync_valid: capitalUsd > 0 && Number.isFinite(pnlUsdAtClose),
        sync_skip_reasons: capitalUsd > 0 ? [] : ["invalid_capital_usd"],
      });

      position = null;
    }
  }

  return trades;
}

async function buildCombinedPreview(query = {}) {
  const days = Number(query.lookbackDays || 60);
  const limit = query.limit ? Number(query.limit) : 100;
  const finalEndTime = Date.now();
  const finalStartTime = finalEndTime - days * 24 * 60 * 60 * 1000;

  // Keep the existing USDT-M importer untouched and append Coin-M results.
  const usdtPreview = await callUsdtMPreview(query);

  const { orders, fillsByOrder } = await fetchCoinMData({
    startTime: finalStartTime,
    endTime: finalEndTime,
    limit,
  });
  const leverageBySymbol = await getCoinMLeverageMap(orders);
  const coinMRows = buildCoinMTrades(orders, fillsByOrder, leverageBySymbol);
  const existingCoinMKeys = await getExistingCoinMKeys();

  const validCoinMRows = coinMRows.filter(
    (r) => r.sync_valid && Math.abs(Number(r.pnl_qty || 0)) > 0.0000000001
  );
  const coinMRowsToInsert = validCoinMRows.filter(
    (r) => !existingCoinMKeys.has(buildLogicalTradeKey(r))
  );
  const coinMAlreadyExists = validCoinMRows.filter((r) =>
    existingCoinMKeys.has(buildLogicalTradeKey(r))
  );
  const coinMSkipped = coinMRows.filter((r) => !r.sync_valid);

  return {
    ...usdtPreview,
    type: "SYNC_PREVIEW",
    markets: ["USDT-M", "COIN-M"],
    ordersCount: Number(usdtPreview.ordersCount || 0) + orders.length,
    totalBuilt: Number(usdtPreview.totalBuilt || 0) + coinMRows.length,
    validTrades: Number(usdtPreview.validTrades || 0) + validCoinMRows.length,
    skippedTrades: Number(usdtPreview.skippedTrades || 0) + coinMSkipped.length,
    alreadyExists: Number(usdtPreview.alreadyExists || 0) + coinMAlreadyExists.length,
    newTrades: Number(usdtPreview.newTrades || 0) + coinMRowsToInsert.length,
    rowsToInsert: [
      ...(usdtPreview.rowsToInsert || []),
      ...coinMRowsToInsert,
    ],
    alreadyExistsRows: [
      ...(usdtPreview.alreadyExistsRows || []),
      ...coinMAlreadyExists,
    ],
    skippedRows: [
      ...(usdtPreview.skippedRows || []),
      ...coinMSkipped,
    ],
    coinM: {
      ordersCount: orders.length,
      totalBuilt: coinMRows.length,
      validTrades: validCoinMRows.length,
      alreadyExists: coinMAlreadyExists.length,
      newTrades: coinMRowsToInsert.length,
    },
  };
}

async function getBingxCombinedSyncPreview(req, res) {
  try {
    const preview = await buildCombinedPreview(req.query || {});
    res.json(preview);
  } catch (err) {
    console.error("getBingxCombinedSyncPreview error:", err);
    res.status(500).json({
      error: "Error generando preview combinado de sync BingX",
      detail: err.message,
    });
  }
}

async function syncBingxCombinedTradesConfirm(req, res) {
  try {
    const preview = await buildCombinedPreview(req.query || {});
    const rowsToInsert = preview.rowsToInsert || [];

    if (!rowsToInsert.length) {
      return res.json({
        ok: true,
        inserted: 0,
        message: "No hay trades nuevos para insertar",
        preview,
      });
    }

    const cleanRows = rowsToInsert.map((r) => ({
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

    const insertQuery = `
      INSERT INTO ${table("trading_trades_raw")}
      (
        trade_id, instrument, contract_type, settlement_asset, direction,
        capital_usd, opened_at, closed_at, holding_days, entry_price,
        exit_price, leverage, pnl_pct, pnl_qty, pnl_usd_reported,
        exchange, is_capital_held, destination, notes, source,
        created_at, updated_at
      )
      SELECT
        trade_id, instrument, contract_type, settlement_asset, direction,
        capital_usd, DATE(opened_at), DATE(closed_at), holding_days, entry_price,
        exit_price, leverage, pnl_pct, pnl_qty, pnl_usd_reported,
        exchange, is_capital_held, destination, notes, source,
        CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
      FROM UNNEST(@rows)
    `;

    await runQuery(insertQuery, { rows: cleanRows });

    res.json({
      ok: true,
      inserted: cleanRows.length,
      insertedRows: cleanRows,
      preview,
    });
  } catch (err) {
    console.error("syncBingxCombinedTradesConfirm error:", err);
    res.status(500).json({
      error: "Error confirmando sync combinado BingX",
      detail: err.message,
    });
  }
}

module.exports = {
  getBingxCombinedSyncPreview,
  syncBingxCombinedTradesConfirm,
};