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