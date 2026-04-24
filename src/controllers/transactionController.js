const { BigQuery } = require("@google-cloud/bigquery");
const crypto = require("crypto");

const bigquery = new BigQuery();

const SWAP_TICKER_MAP = {
  USDT: "USDT",
  BTC: "CURRENCY:BTCARS",
  ETH: "CURRENCY:ETHARS",
  SOL: "CURRENCY:SOLARS",
  RON: "CURRENCY:RON",
};

const SWAP_ALLOWED = ["USDT", "BTC", "ETH", "SOL", "RON"];

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function createBase(body = {}) {
  const {
    fecha,
    broker,
    owner,
    description,
  } = body;

  return {
    source_table: "manual",
    fecha,
    owner: owner || null,
    broker: broker || null,
    description: description || null,
    raw_payload: JSON.stringify(body),
  };
}

function createRow(base, overrides = {}) {
  return {
    id: crypto.randomUUID(),
    ...base,
    ...overrides,
  };
}

function validateBody(body = {}) {
  const {
    family,
    action,
    fecha,
    ticker,
    quantity,
    gross_amount,
    from_ticker,
    to_ticker,
    from_quantity,
    to_quantity,
  } = body;

  if (!family) {
    throw new Error("family es obligatoria");
  }

  if (!fecha) {
    throw new Error("fecha es obligatoria");
  }

  if (family !== "SWAP" && !action) {
    throw new Error("action es obligatoria");
  }

  const parsedQuantity = toNumber(quantity);
  const parsedGross = toNumber(gross_amount);
  const parsedFromQuantity = toNumber(from_quantity);
  const parsedToQuantity = toNumber(to_quantity);

  if (parsedGross === null || parsedGross <= 0) {
    throw new Error("gross_amount es obligatorio y debe ser mayor a 0");
  }

  if (family === "FX_USD" || family === "USDT" || family === "ASSET") {
    if (parsedQuantity === null || parsedQuantity <= 0) {
      throw new Error("quantity es obligatoria y debe ser mayor a 0");
    }
  }

  if (family === "ASSET" && (!ticker || !ticker.trim())) {
    throw new Error("ticker es obligatorio para activos");
  }

  if (family === "SWAP") {
    if (!from_ticker || !to_ticker) {
      throw new Error("from_ticker y to_ticker son obligatorios para SWAP");
    }

    if (!SWAP_ALLOWED.includes(from_ticker) || !SWAP_ALLOWED.includes(to_ticker)) {
      throw new Error("Los tickers de SWAP no son válidos");
    }

    if (from_ticker === to_ticker) {
      throw new Error("from_ticker y to_ticker no pueden ser iguales");
    }

    const oneSideIsUsdt = from_ticker === "USDT" || to_ticker === "USDT";
    if (!oneSideIsUsdt) {
      throw new Error("SWAP solo permite conversiones entre USDT y BTC/ETH/SOL/RON");
    }

    if (parsedFromQuantity === null || parsedFromQuantity <= 0) {
      throw new Error("from_quantity es obligatoria y debe ser mayor a 0");
    }

    if (parsedToQuantity === null || parsedToQuantity <= 0) {
      throw new Error("to_quantity es obligatoria y debe ser mayor a 0");
    }
  }

  return {
    parsedQuantity,
    parsedGross,
    parsedFromQuantity,
    parsedToQuantity,
  };
}

function buildRows(body = {}) {
  const { family, action, ticker } = body;
  const validation = validateBody(body);
  const { parsedQuantity, parsedGross, parsedFromQuantity, parsedToQuantity } = validation;
  const base = createBase(body);

  switch (family) {
    case "CASH_USD": {
      if (action !== "IN" && action !== "OUT") {
        throw new Error("Para CASH_USD action debe ser IN o OUT");
      }

      const sign = action === "OUT" ? -1 : 1;
      const amount = sign * Math.abs(parsedGross);

      return [
        createRow(base, {
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
        }),
      ];
    }

    case "FX_USD": {
      if (action !== "BUY" && action !== "SELL") {
        throw new Error("Para FX_USD action debe ser BUY o SELL");
      }

      const fxRate = parsedGross / parsedQuantity;

      return [
        createRow(base, {
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
        }),
      ];
    }

    case "USDT": {
      if (action !== "BUY" && action !== "SELL") {
        throw new Error("Para USDT action debe ser BUY o SELL");
      }

      const fxRate = parsedGross / parsedQuantity;

      return [
        createRow(base, {
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
        }),
      ];
    }

    case "SWAP": {
      const { from_ticker, to_ticker } = body;


      const fromRawTicker = SWAP_TICKER_MAP[from_ticker];
      const toRawTicker = SWAP_TICKER_MAP[to_ticker];

      const fromUnitPrice =
        from_ticker === "USDT"
          ? 1
          : parsedFromQuantity
            ? parsedGross / parsedFromQuantity
            : null;

      const toUnitPrice =
        to_ticker === "USDT"
          ? 1
          : parsedToQuantity
            ? parsedGross / parsedToQuantity
            : null;


      if (from_ticker === "USDT") {
        const sellUsdtRow = createRow(base, {
          movement_type: "SELL_USDT",
          category: "CRYPTO",
          ticker: fromRawTicker,
          instrument_type: "USDT",
          side: "SELL",
          quantity: parsedFromQuantity,
          unit_price: fromUnitPrice,
          price_currency: "USD",
          gross_amount: parsedGross,
          net_amount: parsedGross,
          settlement_currency: "USD",
          fx_rate: null,
          description: body.description
            ? `${body.description} | Swap ${from_ticker} a ${to_ticker}`
            : `Swap ${from_ticker} a ${to_ticker}`,
        });

        const buyAssetRow = createRow(base, {
          movement_type: "BUY_ASSET",
          category: "PORTFOLIO",
          ticker: toRawTicker,
          instrument_type: "ASSET",
          side: "BUY",
          quantity: parsedToQuantity,
          unit_price: toUnitPrice,
          price_currency: "USD",
          gross_amount: parsedGross,
          net_amount: parsedGross,
          settlement_currency: "USD",
          fx_rate: null,
          description: body.description
            ? `${body.description} | Swap ${from_ticker} a ${to_ticker}`
            : `Swap ${from_ticker} a ${to_ticker}`,
        });

        return [sellUsdtRow, buyAssetRow];
      }

      if (to_ticker === "USDT") {
        const sellAssetRow = createRow(base, {
          movement_type: "SELL_ASSET",
          category: "PORTFOLIO",
          ticker: fromRawTicker,
          instrument_type: "ASSET",
          side: "SELL",
          quantity: parsedFromQuantity,
          unit_price: fromUnitPrice,
          price_currency: "USD",
          gross_amount: parsedGross,
          net_amount: parsedGross,
          settlement_currency: "USD",
          fx_rate: null,
          description: body.description
            ? `${body.description} | Swap ${from_ticker} a ${to_ticker}`
            : `Swap ${from_ticker} a ${to_ticker}`,
        });

        const buyUsdtRow = createRow(base, {
          movement_type: "BUY_USDT",
          category: "CRYPTO",
          ticker: toRawTicker,
          instrument_type: "USDT",
          side: "BUY",
          quantity: parsedToQuantity,
          unit_price: toUnitPrice,
          price_currency: "USD",
          gross_amount: parsedGross,
          net_amount: parsedGross,
          settlement_currency: "USD",
          fx_rate: null,
          description: body.description
            ? `${body.description} | Swap ${from_ticker} a ${to_ticker}`
            : `Swap ${from_ticker} a ${to_ticker}`,
        });

        return [sellAssetRow, buyUsdtRow];
      }

      throw new Error("SWAP inválido");
    }

    case "ASSET": {
      if (action !== "BUY" && action !== "SELL") {
        throw new Error("Para ASSET action debe ser BUY o SELL");
      }

      const cleanTicker = ticker.trim();
      const unitPrice = parsedQuantity ? parsedGross / parsedQuantity : null;

      const assetRow = createRow(base, {
        movement_type: action === "BUY" ? "BUY_ASSET" : "SELL_ASSET",
        category: "PORTFOLIO",
        ticker: cleanTicker,
        instrument_type: "ASSET",
        side: action,
        quantity: parsedQuantity,
        unit_price: unitPrice,
        price_currency: "USD",
        gross_amount: parsedGross,
        net_amount: parsedGross,
        settlement_currency: "USD",
        fx_rate: null,
      });

      const cashRow = createRow(base, {
        movement_type: action === "BUY" ? "EXPENSE_USD" : "INCOME_USD",
        category: "CASH",
        ticker: "USD",
        instrument_type: "USD",
        side: action === "BUY" ? "OUT" : "IN",
        quantity: null,
        unit_price: null,
        price_currency: "USD",
        gross_amount: action === "BUY" ? -Math.abs(parsedGross) : Math.abs(parsedGross),
        net_amount: action === "BUY" ? -Math.abs(parsedGross) : Math.abs(parsedGross),
        settlement_currency: "USD",
        fx_rate: null,
        description: body.description
          ? `${body.description} | Contrapartida ${action === "BUY" ? "compra" : "venta"} ${cleanTicker}`
          : `Contrapartida ${action === "BUY" ? "compra" : "venta"} ${cleanTicker}`,
      });

      return [assetRow, cashRow];
    }

    default:
      throw new Error(`family no soportada: ${family}`);
  }
}

async function previewTransaction(req, res) {
  try {
    const rows = buildRows(req.body);

    return res.json({
      preview: rows,
    });
  } catch (error) {
    return res.status(400).json({
      error: error?.message || "Error al generar preview",
    });
  }
}

async function createTransaction(req, res) {
  try {
    const rows = buildRows(req.body);

    await bigquery
      .dataset("portfolio")
      .table("movements")
      .insert(rows);

    return res.status(201).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error inserting movement:", error);

    const message = error?.message || "Failed to insert movement";

    if (message.includes("obligatoria") || message.includes("debe")) {
      return res.status(400).json({ error: message });
    }

    return res.status(500).json({
      error: message,
      details: message,
      insertErrors: error?.errors || null,
    });
  }
}

module.exports = {
  createTransaction,
  previewTransaction,
};