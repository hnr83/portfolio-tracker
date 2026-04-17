export function sortRows(rows, sortConfig) {
  const { key, direction } = sortConfig;

  return [...rows].sort((a, b) => {
    const aValue = a?.[key];
    const bValue = b?.[key];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    const aText = String(aValue).toLowerCase();
    const bText = String(bValue).toLowerCase();

    if (aText < bText) return direction === "asc" ? -1 : 1;
    if (aText > bText) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

export function toggleSort(currentSort, key) {
  if (currentSort.key === key) {
    return {
      key,
      direction: currentSort.direction === "asc" ? "desc" : "asc",
    };
  }

  return {
    key,
    direction: "asc",
  };
}