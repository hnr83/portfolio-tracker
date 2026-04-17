import React from "react";

export default function TransactionsView({
    selectedAssetMovements,
    setSelectedAssetMovements,
    loadMovements,
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
}) {
    return (
        <SectionShell className="mt-8">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-white">
                        {selectedAssetMovements
                            ? `Transacciones - ${selectedAssetMovements}`
                            : "Transacciones"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Historial completo de movimientos
                    </p>
                </div>

                {selectedAssetMovements && (
                    <button
                        onClick={async () => {
                            setSelectedAssetMovements(null);
                            await loadMovements();
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-indigo-400 transition hover:bg-slate-900"
                    >
                        Ver todas
                    </button>
                )}
            </div>

            <FilterToolbar right={`${filteredAndSortedMovements.length} resultados`}>
                <input
                    type="text"
                    placeholder="Buscar ticker, tipo o broker..."
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
                            <SortableHeader
                                label="Fecha"
                                sortKey="fecha"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                            <SortableHeader
                                label="Tipo"
                                sortKey="movement_type"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                            <SortableHeader
                                label="Categoría"
                                sortKey="category"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                            <SortableHeader
                                label="Ticker"
                                sortKey="ticker"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                            <SortableHeader
                                label="Instrumento"
                                sortKey="instrument_type"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                            <SortableHeader
                                label="Cantidad"
                                sortKey="quantity"
                                sortState={movementSort}
                                onSort={setMovementSort}
                                align="right"
                            />
                            <SortableHeader
                                label="Precio Unit."
                                sortKey="unit_price"
                                sortState={movementSort}
                                onSort={setMovementSort}
                                align="right"
                            />
                            <SortableHeader
                                label="Monto Bruto"
                                sortKey="gross_amount"
                                sortState={movementSort}
                                onSort={setMovementSort}
                                align="right"
                            />
                            <SortableHeader
                                label="Monto Neto"
                                sortKey="net_amount"
                                sortState={movementSort}
                                onSort={setMovementSort}
                                align="right"
                            />
                            <SortableHeader
                                label="Broker"
                                sortKey="broker"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                            <SortableHeader
                                label="Owner"
                                sortKey="owner"
                                sortState={movementSort}
                                onSort={setMovementSort}
                            />
                        </tr>
                    </thead>

                    <tbody>
                        {filteredAndSortedMovements.map((m, i) => (
                            <tr
                                key={m.id || i}
                                className={`border-t border-slate-800/80 transition-colors hover:bg-slate-800/20 ${selectedAssetMovements && m.ticker === selectedAssetMovements
                                        ? "bg-indigo-500/8"
                                        : ""
                                    }`}
                            >
                                <td className="px-4 py-4">
                                    {m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "-"}
                                </td>
                                <td className="px-4 py-4">{m.movement_type}</td>
                                <td className="px-4 py-4">{m.category}</td>
                                <td className="px-4 py-4 font-semibold text-white">{m.ticker}</td>
                                <td className="px-4 py-4">{m.instrument_type || "-"}</td>
                                <td className="px-4 py-4 text-right tabular-nums">
                                    {m.quantity == null ? "-" : formatNumber(m.quantity, 4)}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums">
                                    {m.unit_price == null
                                        ? "-"
                                        : formatCurrency(m.unit_price, m.price_currency || "USD")}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums">
                                    {m.gross_amount == null
                                        ? "-"
                                        : formatCurrency(
                                            m.gross_amount,
                                            m.settlement_currency || m.price_currency || "USD"
                                        )}
                                </td>
                                <td className="px-4 py-4 text-right tabular-nums">
                                    {m.net_amount == null
                                        ? "-"
                                        : formatCurrency(
                                            m.net_amount,
                                            m.settlement_currency || m.price_currency || "USD"
                                        )}
                                </td>
                                <td className="px-4 py-4">{m.broker || "-"}</td>
                                <td className="px-4 py-4">{m.owner || "-"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionShell>
    );
}