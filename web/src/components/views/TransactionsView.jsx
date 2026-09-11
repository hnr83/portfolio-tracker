import React from "react";
import { formatDate } from "../../utils/formatters";

function TransactionInfo({ movement }) {
    const description = String(movement.description || "").trim();
    const source = String(movement.source_table || "").trim();
    const groupId = String(movement.transaction_group_id || "").trim();

    const hasDetails = Boolean(
        description || source || movement.broker || movement.owner || groupId
    );

    return (
        <span className="relative inline-flex shrink-0 items-center group/info">
            <button
                type="button"
                aria-label="Ver detalle de la transacción"
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold leading-none transition ${
                    hasDetails
                        ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-300 hover:border-indigo-300 hover:bg-indigo-500/20 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        : "cursor-default border-slate-700/80 bg-slate-900/60 text-slate-600"
                }`}
            >
                i
            </button>

            {hasDetails && (
                <div className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-left opacity-0 shadow-2xl backdrop-blur transition group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:visible group-focus-within/info:opacity-100">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Detalle de la transacción
                    </div>

                    <div className="space-y-2 text-xs leading-relaxed text-slate-300">
                        {description && (
                            <div>
                                <span className="text-slate-500">Detalle:</span>{" "}
                                <span className="text-slate-100">{description}</span>
                            </div>
                        )}

                        {source && (
                            <div>
                                <span className="text-slate-500">Origen:</span>{" "}
                                <span className="text-slate-200">{source}</span>
                            </div>
                        )}

                        {movement.broker && (
                            <div>
                                <span className="text-slate-500">Broker:</span>{" "}
                                <span className="text-slate-200">{movement.broker}</span>
                            </div>
                        )}

                        {movement.owner && (
                            <div>
                                <span className="text-slate-500">Owner:</span>{" "}
                                <span className="text-slate-200">{movement.owner}</span>
                            </div>
                        )}

                        {groupId && (
                            <div className="break-all">
                                <span className="text-slate-500">Grupo:</span>{" "}
                                <span className="text-slate-300">{groupId}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </span>
    );
}

export default function TransactionsView({
    selectedAssetMovements,
    setSelectedAssetMovements,
    filteredAndSortedMovements,
    movementSearch,
    setMovementSearch,
    movementCategoryFilter,
    setMovementCategoryFilter,
    movementSort,
    setMovementSort,
    formatNumber,
    formatCurrency,
    SortableHeader,
    FilterToolbar,
    SectionShell,
    marketData,

}) {

    const normalizeTicker = (ticker) =>
        String(ticker || "")
            .replace("CURRENCY:", "")
            .replace("ARS", "");

    const getUnitPrice = (m) => {
        if (m.unit_price != null) return Number(m.unit_price);

        const qty = Number(m.quantity);
        const gross = Number(m.gross_amount);

        if (!qty || !gross) return null;

        return gross / qty;
    };

    const getMarketAsset = (m) => {
        const ticker = normalizeTicker(m.ticker);

        return marketData?.find(
            (x) => normalizeTicker(x.ticker) === ticker
        ) || null;
    };

    const getCurrentPrice = (m) => {
        const asset = getMarketAsset(m);
        if (!asset) return null;

        // CEDEARs in marketData are now valued in ARS using CCL.
        // Return the ARS market price so PnL can be compared against
        // the actual ARS purchase price, avoiding an artificial FX loss.
        if (asset.is_cedear) {
            return asset.market_price == null ? null : Number(asset.market_price);
        }

        return asset.market_price == null ? null : Number(asset.market_price);
    };

    const getComparableBuyPrice = (m) => {
        const buyPrice = getUnitPrice(m);
        if (buyPrice == null) return null;

        const asset = getMarketAsset(m);
        if (!asset?.is_cedear) return buyPrice;

        // CEDEAR market price is ARS. Historical/manual CEDEAR purchases
        // may store unit_price in USD while settlement happened in ARS.
        // Rebuild the actual ARS entry price with the FX recorded on the
        // transaction, without changing the ledger or its USD cost basis.
        if (String(m.price_currency || "").toUpperCase() === "ARS") {
            return buyPrice;
        }

        const fxRate = Number(m.fx_rate);
        if (Number.isFinite(fxRate) && fxRate > 0) {
            return buyPrice * fxRate;
        }

        // If an old CEDEAR row has no historical FX, keep the previous
        // USD-comparable fallback instead of inventing an ARS entry price.
        if (asset.underlying_price_usd && asset.ratio_numerator) {
            return buyPrice;
        }

        return null;
    };

    const getComparableCurrentPrice = (m) => {
        const asset = getMarketAsset(m);
        if (!asset) return null;

        if (asset.is_cedear) {
            const fxRate = Number(m.fx_rate);
            const priceCurrency = String(m.price_currency || "").toUpperCase();

            if (priceCurrency === "ARS" || (Number.isFinite(fxRate) && fxRate > 0)) {
                return asset.market_price == null ? null : Number(asset.market_price);
            }

            // Legacy CEDEAR without purchase FX: compare in USD against
            // underlying/ratio, matching the old behavior.
            if (asset.underlying_price_usd && asset.ratio_numerator) {
                return (
                    Number(asset.underlying_price_usd) *
                    Number(asset.ratio_denominator || 1) /
                    Number(asset.ratio_numerator)
                );
            }
        }

        return getCurrentPrice(m);
    };

    const getPnlPct = (m) => {
        const buyPrice = getComparableBuyPrice(m);
        const current = getComparableCurrentPrice(m);

        if (!buyPrice || !current) return null;

        return ((current - buyPrice) / buyPrice) * 100;
    };
    const selectedTicker =
        selectedAssetMovements?.ticker || null;

    const selectedNormalizedTicker =
        selectedAssetMovements?.normalized_ticker || null;

    const movementsToShow = filteredAndSortedMovements;

    return (
        <SectionShell className="mt-8">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-white">
                        {selectedTicker
                            ? `Transacciones - ${selectedTicker}`
                            : "Transacciones"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Historial completo de movimientos
                    </p>
                </div>

                {selectedAssetMovements && (
                    <button
                        onClick={() => {
                            setSelectedAssetMovements(null);
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-indigo-400 transition hover:bg-slate-900"
                    >
                        Ver todas
                    </button>
                )}
            </div>

            <FilterToolbar right={`${movementsToShow.length} resultados`}>
                <input
                    type="text"
                    placeholder="Buscar ticker, tipo, broker o detalle..."
                    value={movementSearch}
                    onChange={(e) => setMovementSearch(e.target.value)}
                    className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />

                <select
                    value={movementCategoryFilter}
                    onChange={(e) => setMovementCategoryFilter(e.target.value)}
                    className="rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                    <option value="ALL">Todas las categorías</option>
                    <option value="PORTFOLIO">PORTFOLIO</option>
                    <option value="CRYPTO">CRYPTO</option>
                    <option value="FX">FX</option>
                    <option value="CASH">CASH</option>
                </select>
            </FilterToolbar>

            <div className="overflow-auto rounded-[22px] border border-slate-800/80 bg-slate-950/70">
                <table className="w-full text-sm">
                    <thead className="bg-slate-950/95 text-slate-400">
                        <tr>
                            <SortableHeader label="Fecha" sortKey="fecha" sortState={movementSort} onSort={setMovementSort} />
                            <SortableHeader label="Tipo" sortKey="movement_type" sortState={movementSort} onSort={setMovementSort} />
                            <SortableHeader label="Categoría" sortKey="category" sortState={movementSort} onSort={setMovementSort} />
                            <SortableHeader label="Ticker" sortKey="ticker" sortState={movementSort} onSort={setMovementSort} />
                            <SortableHeader label="Instrumento" sortKey="instrument_type" sortState={movementSort} onSort={setMovementSort} />
                            <SortableHeader label="Cantidad" sortKey="quantity" sortState={movementSort} onSort={setMovementSort} align="right" />
                            <SortableHeader label="Precio Unit." sortKey="calculated_unit_price" sortState={movementSort} onSort={setMovementSort} align="right" />
                            <SortableHeader label="PnL %" sortKey="calculated_pnl_pct" sortState={movementSort} onSort={setMovementSort} align="right" />
                            <SortableHeader label="Monto Bruto" sortKey="gross_amount" sortState={movementSort} onSort={setMovementSort} align="right" />
                            <SortableHeader label="Monto Neto" sortKey="net_amount" sortState={movementSort} onSort={setMovementSort} align="right" />
                            <SortableHeader label="Broker" sortKey="broker" sortState={movementSort} onSort={setMovementSort} />
                            <SortableHeader label="Owner" sortKey="owner" sortState={movementSort} onSort={setMovementSort} />
                        </tr>
                    </thead>

                    <tbody>
                        {movementsToShow.map((m, i) => (
                            <tr
                                key={m.id || i}
                                className={`border-t border-slate-800/80 text-slate-200 transition-colors hover:bg-slate-800/20 ${selectedAssetMovements &&
                                    (m.ticker === selectedTicker ||
                                        m.normalized_ticker === selectedNormalizedTicker)
                                    ? "bg-indigo-500/8"
                                    : ""
                                    }`}
                            >
                                <td className="px-4 py-4 text-slate-300">{formatDate(m.fecha)}</td>
                                <td className="px-4 py-4 text-slate-200">
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <span>{m.movement_type}</span>
                                        <TransactionInfo movement={m} />
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-slate-300">{m.category}</td>
                                <td className="px-4 py-4 font-semibold text-white">{m.ticker}</td>
                                <td className="px-4 py-4 text-slate-300">{m.instrument_type || "-"}</td>
                                <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                    {m.quantity == null ? "-" : formatNumber(m.quantity, 4)}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                    {getUnitPrice(m) == null ? "-" : formatCurrency(getUnitPrice(m), m.price_currency || "USD")}
                                </td>
                                <td className={`px-4 py-4 text-right font-semibold ${getPnlPct(m) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {getPnlPct(m) == null ? "-" : `${getPnlPct(m).toFixed(2)}%`}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                    {m.gross_amount == null ? "-" : formatCurrency(m.gross_amount, m.price_currency || m.settlement_currency || "USD")}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums text-slate-200">
                                    {m.net_amount == null ? "-" : formatCurrency(m.net_amount, m.price_currency || m.settlement_currency || "USD")}
                                </td>
                                <td className="px-4 py-4 text-slate-300">{m.broker || "-"}</td>
                                <td className="px-4 py-4 text-slate-300">{m.owner || "-"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionShell>
    );
}
