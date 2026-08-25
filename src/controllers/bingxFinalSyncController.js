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

function fixCoinMRow(row) {
  if (row.contract_type !== "M_MONEDA" || !String(row.trade_id).startsWith("BINGX-COINM|")) {
    return row;
  }

  const times = extractCoinMTimes(row.trade_id);
  if (!times) return row;

  const settlement = String(row.settlement_asset || row.instrument || "").toUpperCase();
  const holdingDays = Math.floor((times.closeTime - times.openTime) / 86400000);

  // BingX's documented Coin-M API exposes closed PnL and commissions in fills,
  // but does not expose a Coin-M account income/funding-history endpoint.
  // Keep the API-derived PnL untouched instead of calling an unsupported endpoint.
  return {
    ...row,
    opened_at: argentinaDate(times.openTime),
    closed_at: argentinaDate(times.closeTime),
    holding_days: holdingDays,
    notes: `${row.notes || "coin_m"}; funding_not_available_via_coinm_api ${settlement}`,
  };
}

async function buildFixedPreview(query = {}) {
  const preview = await callBasePreview(query);
  const rowsToInsert = (preview.rowsToInsert || []).map(fixCoinMRow);
  const alreadyExistsRows = (preview.alreadyExistsRows || []).map(fixCoinMRow);
  const skippedRows = (preview.skippedRows || []).map(fixCoinMRow);
  return { ...preview, rowsToInsert, alreadyExistsRows, skippedRows };
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
    const rowsToInsert = preview.rowsToInsert || [];
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
    res.json({ ok: true, inserted: cleanRows.length, insertedRows: cleanRows, preview });
  } catch (err) {
    console.error("syncBingxFinalTradesConfirm error:", err);
    res.status(500).json({ error: "Error confirmando sync BingX", detail: err.message });
  }
}

module.exports = { getBingxFinalSyncPreview, syncBingxFinalTradesConfirm };
