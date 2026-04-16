const { BigQuery } = require("@google-cloud/bigquery");
const crypto = require("crypto");

const bigquery = new BigQuery();

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildRow(body = {}) {
  const {
    family,
    action,
    fecha,
    ticker,
    quantity,
    gross_amount,
    broker,
    owner,
    description,
  } = body;

  if (!family) {
    throw new Error("family es obligatoria");
  }

  if (!action) {
    throw new Error("action es obligatoria");
  }

  if (!fecha) {
    throw new Error("fecha es obligatoria");
  }

  const parsedQuantity = toNumber(quantity);
  const parsedGross = toNumber(gross_amount);

  if (parsedGross === null) {
    throw new Error("gross_amount es obligatorio");
  }

  const base = {
    id: crypto.randomUUID(),
    source_table: "manual",
    fecha,
    owner: owner || null,
    broker: broker || null,
    description: description || null,
    raw_payload: JSON.stringify(body),
  };

  switch (family) {
    case "CASH_USD": {
      if (action !== "IN" && action !== "OUT") {
        throw new Error("Para CASH_USD action debe ser IN o OUT");
      }

      const sign = action === "OUT" ? -1 : 1;
      const amount = sign * Math.abs(parsedGross);

      return {
        ...base,
        movement_type: action === "IN" ? "INCOME_USD" : "EXPENSE_USD",
        category: "CASH",
        ticker: "USD",
        instrument_type: "USD",
        side: action,
        quantity: null,
        unit_price: null,
        price_currency: "USD",
        gross_amount: amount,
        net_amount: amount,
        settlement_currency: "USD",
        fx_rate: null,
      };
    }

    case "FX_USD": {
      if (action !== "BUY" && action !== "SELL") {
        throw new Error("Para FX_USD action debe ser BUY o SELL");
      }

      if (parsedQuantity === null || parsedQuantity <= 0) {
        throw new Error("quantity es obligatoria para compra/venta de USD");
      }

      const fxRate = parsedGross / parsedQuantity;

      return {
        ...base,
        movement_type: action === "BUY" ? "BUY_USD" : "SELL_USD",
        category: "FX",
        ticker: "USD",
        instrument_type: "USD",
        side: action,
        quantity: parsedQuantity,
        unit_price: fxRate,
        price_currency: "ARS",
        gross_amount: parsedGross,
        net_amount: parsedGross,
        settlement_currency: "ARS",
        fx_rate: fxRate,
      };
    }

    case "USDT": {
      if (action !== "BUY" && action !== "SELL") {
        throw new Error("Para USDT action debe ser BUY o SELL");
      }

      if (parsedQuantity === null || parsedQuantity <= 0) {
        throw new Error("quantity es obligatoria para compra/venta de USDT");
      }

      const fxRate = parsedGross / parsedQuantity;

      return {
        ...base,
        movement_type: action === "BUY" ? "BUY_USDT" : "SELL_USDT",
        category: "CRYPTO",
        ticker: "USDT",
        instrument_type: "USDT",
        side: action,
        quantity: parsedQuantity,
        unit_price: fxRate,
        price_currency: "ARS",
        gross_amount: parsedGross,
        net_amount: parsedGross,
        settlement_currency: "ARS",
        fx_rate: fxRate,
      };
    }

    case "ASSET": {
      if (action !== "BUY" && action !== "SELL") {
        throw new Error("Para ASSET action debe ser BUY o SELL");
      }

      if (!ticker || !ticker.trim()) {
        throw new Error("ticker es obligatorio para activos");
      }

      if (parsedQuantity === null || parsedQuantity <= 0) {
        throw new Error("quantity es obligatoria para activos");
      }

      return {
        ...base,
        movement_type: action === "BUY" ? "BUY_ASSET" : "SELL_ASSET",
        category: "PORTFOLIO",
        ticker: ticker.trim(),
        instrument_type: "ASSET",
        side: action,
        quantity: parsedQuantity,
        unit_price: null,
        price_currency: "USD",
        gross_amount: parsedGross,
        net_amount: parsedGross,
        settlement_currency: "USD",
        fx_rate: null,
      };
    }

    default:
      throw new Error(`family no soportada: ${family}`);
  }
}

async function createTransaction(req, res) {
  try {
    const row = buildRow(req.body);

    await bigquery
      .dataset("portfolio")
      .table("movements")
      .insert([row]);

    return res.status(201).json({
      success: true,
      data: row,
    });
  } catch (error) {
    console.error("Error inserting movement:", error);

    return res.status(500).json({
      error: error.message || "Failed to insert movement",
      details: error.message,
      insertErrors: error.errors || null,
    });
  }
}

module.exports = {
  createTransaction,
};