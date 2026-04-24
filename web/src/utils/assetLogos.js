const LOGO_DEV_TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN;

const LOGO_MAP = {
  BTC: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
  ETH: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
  SOL: "https://cryptologos.cc/logos/solana-sol-logo.png",
  RON: "https://cryptologos.cc/logos/ronin-ron-logo.png",
  USDT: "https://cryptologos.cc/logos/tether-usdt-logo.png",

  TSLA: `https://img.logo.dev/tesla.com?token=${LOGO_DEV_TOKEN}`,
  GOOGL: `https://img.logo.dev/google.com?token=${LOGO_DEV_TOKEN}`,
  AAPL: `https://img.logo.dev/apple.com?token=${LOGO_DEV_TOKEN}`,
  MELI: `https://img.logo.dev/mercadolibre.com?token=${LOGO_DEV_TOKEN}`,

  "BATS:ARKK": `https://img.logo.dev/ark-funds.com?token=${LOGO_DEV_TOKEN}`,
  "BATS:ARKG": `https://img.logo.dev/ark-funds.com?token=${LOGO_DEV_TOKEN}`,
  "BCBA:TSLA": `https://img.logo.dev/tesla.com?token=${LOGO_DEV_TOKEN}`, 
  "BCBA:GOOGL": `https://img.logo.dev/google.com?token=${LOGO_DEV_TOKEN}`,

  DEFAULT: "",
};

const NORMALIZED_FROM_RAW = {
  "CURRENCY:BTCARS": "BTC",
  "CURRENCY:ETHARS": "ETH",
  "CURRENCY:SOLARS": "SOL",
  "CURRENCY:RON": "RON",
};

export function resolveLogoKey(ticker, normalizedTicker) {
  if (normalizedTicker && LOGO_MAP[normalizedTicker]) return normalizedTicker;
  if (ticker && LOGO_MAP[ticker]) return ticker;
  if (ticker && NORMALIZED_FROM_RAW[ticker]) return NORMALIZED_FROM_RAW[ticker];
  return "DEFAULT";
}

export function getAssetLogo(ticker, normalizedTicker) {
  const key = resolveLogoKey(ticker, normalizedTicker);
  return LOGO_MAP[key] || LOGO_MAP.DEFAULT;
}

export function getAssetDisplayName(ticker, normalizedTicker) {
  return normalizedTicker || ticker || "N/A";
}