const { runQuery } = require("../services/bigQueryService");
const { table } = require("../utils/bigqueryHelper");
const {
  getBingxCombinedSyncPreview,
} = require("./bingxCombinedSyncController");

function argentinaDate(ms) {
  return new Date(Number(ms) - 3 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

function extractCoinMTimes(tradeId) {
  const parts = String(tradeId || "").split("|");
  if (parts[0] !== "BINGX-COINM" || parts.length < 5) return null;
  const openTime = Number(parts[3]);
  const closeTime = Number(parts[4]);
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return null;
  return { openTime, closeTime };
}

async function callBasePreview(query) {
  let payload;
  let failure;
  const mockReq = { query };
  const mockRes = {
    json: (data) => { payload = data; return data; },
    status: (code) => ({
      json: (data) => {
        failure = new Error(data?.detail || data?.error || `Preview failed ${code}`);
        return data;
      },
    }),
  };
  await getBingxCombinedSyncPreview(mockReq, mockRes);
  if (failure) throw failure;
  return payload || {};
}

function markCoinMForManualFunding(row) {
  if (row.contract_type !== "M_MONEDA" || !String(row.trade_id).startsWith("BINGX-COINM|")) {
    return row;
  }

  const times = extractCoinMTimes(row.trade_id);
  if (!times) return row;

  return {
    ...row,
    opened_at: argentinaDate(times.openTime),
    closed_at: argentinaDate(times.closeTime),
    holding_days: Math.floor((times.closeTime - times.openTime) / 86400000),
    funding_manual_required: true,
    funding_qty: null,
    pnl_qty_before_funding: Number(row.pnl_qty || 0),
    pnl_usd_before_funding: Number(row.pnl_usd_reported || 0),
    notes: `${String(row.notes || "coin_m").replace(/; funding_not_available_via_coinm_api[^;]*/g, "")}; funding_manual_required`,
  };
}

function applyManualFunding(row, fundingOverrides = {}) {
  if (!row.funding_manual_required) return row;

  if (!Object.prototype.hasOwnProperty.call(fundingOverrides, row.trade_id)) {
    const err = new Error(`Falta cargar funding manual para ${row.instrument} ${row.direction} ${row.closed_at}`);
    err.statusCode = 400;
    throw err;
  }

  const rawFunding = fundingOverrides[row.trade_id];
  if (rawFunding === "" || rawFunding === null || rawFunding === undefined) {
    const err = new Error(`Funding manual vacío para ${row.instrument} ${row.direction} ${row.closed_at}`);
    err.statusCode = 400;
    throw err;
  }

  const fundingQty = Number(rawFunding);
  if (!Number.isFinite(fundingQty)) {
    const err = new Error(`Funding manual inválido para ${row.instrument} ${row.direction} ${row.closed_at}`);
    err.statusCode = 400;
    throw err;
  }

  const basePnlQty = Number(row.pnl_qty_before_funding ?? row.pnl_qty ?? 0);
  const pnlQty = basePnlQty + fundingQty;
  const exitPrice = Number(row.exit_price || 0);
  const capitalUsd = Number(row.capital_usd || 0);
  const pnlUsd = pnlQty * exitPrice;

  return {
    ...row,
    funding_qty: fundingQty,
    pnl_qty: pnlQty,
    pnl_usd_reported: pnlUsd,
    pnl_pct: capitalUsd > 0 ? pnlUsd / capitalUsd : 0,
    notes: `${String(row.notes || "coin_m").replace(/; funding_manual_required/g, "")}; funding=${fundingQty} ${row.settlement_asset || row.instrument}`,
  };
}

async function buildFixedPreview(query = {}) {
  const preview = await callBasePreview(query);
  return {
    ...preview,
    rowsToInsert: (preview.rowsToInsert || []).map(markCoinMForManualFunding),
    alreadyExistsRows: (preview.alreadyExistsRows || []).map(markCoinMForManualFunding),
    skippedRows: (preview.skippedRows || []).map(markCoinMForManualFunding),
  };
}

async function getBingxFinalSyncPreview(req, res) {
  try {
    res.json(await buildFixedPreview(req.query || {}));
  } catch (err) {
    console.error("getBingxFinalSyncPreview error:", err);
    res.status(500).json({ error: "Error generando preview BingX", detail: err.message });
  }
}

async function syncBingxFinalTradesConfirm(req, res) {
  try {
    const preview = await buildFixedPreview(req.query || {});
    const fundingOverrides = req.body?.fundingOverrides || {};
    const rowsToInsert = (preview.rowsToInsert || []).map((row) =>
      applyManualFunding(row, fundingOverrides)
    );

    if (!rowsToInsert.length) {
      return res.json({ ok: true, inserted: 0, message: "No hay trades nuevos para insertar", preview });
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
      (trade_id, instrument, contract_type, settlement_asset, direction,
       capital_usd, opened_at, closed_at, holding_days, entry_price,
       exit_price, leverage, pnl_pct, pnl_qty, pnl_usd_reported,
       exchange, is_capital_held, destination, notes, source, created_at, updated_at)
      SELECT trade_id, instrument, contract_type, settlement_asset, direction,
       capital_usd, DATE(opened_at), DATE(closed_at), holding_days, entry_price,
       exit_price, leverage, pnl_pct, pnl_qty, pnl_usd_reported,
       exchange, is_capital_held, destination, notes, source,
       CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
      FROM UNNEST(@rows)
    `;

    await runQuery(insertQuery, { rows: cleanRows });
    res.json({ ok: true, inserted: cleanRows.length, insertedRows: cleanRows, preview: { ...preview, rowsToInsert } });
  } catch (err) {
    console.error("syncBingxFinalTradesConfirm error:", err);
    res.status(err.statusCode || 500).json({ error: "Error confirmando sync BingX", detail: err.message });
  }
}

module.exports = { getBingxFinalSyncPreview, syncBingxFinalTradesConfirm };
