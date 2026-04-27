const crypto = require("crypto");
const { get } = require("http");

const BASE_URL = "https://open-api.bingx.com";

async function getBingxIncome(params = {}) {
  return bingxRequest("/openApi/swap/v2/user/income", params);
}

function sign(queryString, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");
}

async function bingxRequest(path, params = {}) {
  const apiKey = process.env.BINGX_API_KEY;
  const apiSecret = process.env.BINGX_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("Faltan BINGX_API_KEY o BINGX_API_SECRET en .env");
  }

  const queryParams = {
    ...params,
    timestamp: Date.now(),
  };

  const queryString = new URLSearchParams(queryParams).toString();
  const signature = sign(queryString, apiSecret);

  const url = `${BASE_URL}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-BX-APIKEY": apiKey,
    },
  });

  const data = await res.json();

  if (!res.ok || data.code !== 0) {
    throw new Error(`BingX error: ${JSON.stringify(data)}`);
  }

  return data.data;
}

async function getBingxSwapPositions(symbol) {
  const params = symbol ? { symbol } : {};

  return bingxRequest("/openApi/swap/v2/user/positions", params);
}

async function getBingxSwapAllOrders({ symbol, startTime, endTime, limit = 100 } = {}) {
  const params = { limit };

  if (symbol) params.symbol = symbol;
  if (startTime) params.startTime = startTime;
  if (endTime) params.endTime = endTime;

  return bingxRequest("/openApi/swap/v2/trade/allOrders", params);
}

async function getBingxSwapFillOrders({ symbol, startTime, endTime, limit = 100 } = {}) {
  const params = { limit };

  if (symbol) params.symbol = symbol;
  if (startTime) params.startTime = startTime;
  if (endTime) params.endTime = endTime;

  return bingxRequest("/openApi/swap/v2/trade/allFillOrders", params);
}

module.exports = {
  getBingxSwapPositions,
  getBingxSwapAllOrders,
  getBingxSwapFillOrders,
  getBingxIncome,
};