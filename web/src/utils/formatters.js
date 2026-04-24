export function formatCurrency(value, currency = "USD") {
  if (value == null || isNaN(value)) return "-";

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatPercent(value) {
  if (value == null || isNaN(value)) return "-";
  return `${(Number(value) * 100).toFixed(2)}%`;
}

export function formatPortfolioPercent(value) {
  if (value == null || isNaN(value)) return "-";
  return `${Number(value).toFixed(2)}%`;
}

export function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return "-";

  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Number(value));
}

export function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || value === "") return "-";

  const n = Number(value);
  if (!Number.isFinite(n)) return "-";

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumberDisplay(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "-";

  const n = Number(value);
  if (!Number.isFinite(n)) return "-";

  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}