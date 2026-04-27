import { useMemo, useState } from "react";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(openedAt, closedAt) {
  if (!openedAt || !closedAt) return 0;

  const start = new Date(`${openedAt}T00:00:00`);
  const end = new Date(`${closedAt}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function calculatePnlPct({ direction, entry_price, exit_price, leverage }) {
  const entry = toNumber(entry_price);
  const exit = toNumber(exit_price);
  const lev = toNumber(leverage) || 1;

  if (!entry || !exit) return 0;

  const raw =
    direction === "SHORT"
      ? (entry - exit) / entry
      : (exit - entry) / entry;

  return raw * lev;
}

function parseAmount(value) {
  if (!value) return "";

  const clean = String(value)
    .replace(/\+/g, "")
    .trim();

  // Caso US: 15,953.90 -> 15953.90
  if (clean.includes(",") && clean.includes(".")) {
    return clean.replace(/,/g, "");
  }

  // Caso AR: 15953,90 -> 15953.90
  if (clean.includes(",") && !clean.includes(".")) {
    return clean.replace(",", ".");
  }

  // Caso normal: 857.7958
  return clean;
}

function parseBingxTradeText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const findDate = (indexFrom = 0) => {
    for (let i = indexFrom; i < lines.length; i++) {
      const match = lines[i].match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}$/);
      if (match) return { value: match[1], index: i };
    }
    return null;
  };

  const openDate = findDate(0);
  const closeDate = openDate ? findDate(openDate.index + 1) : null;

  const symbolIndex = lines.findIndex((line) => /^[A-Z]+USDT$/i.test(line));
  const symbol = symbolIndex >= 0 ? lines[symbolIndex].toUpperCase() : "";
  const instrument = symbol.replace("USDT", "");

  const directionLine = lines.find((line) =>
    ["LONG", "SHORT"].includes(line.toUpperCase())
  );

  const direction = directionLine?.toUpperCase() || "LONG";

  const leverageLine = lines.find((line) => /^\d+X$/i.test(line));
  const leverage = leverageLine ? Number(leverageLine.replace(/X/i, "")) : 1;

  const numericLines = lines.filter((line) =>
    /^[+-]?\d{1,3}(,\d{3})*(\.\d+)?$|^[+-]?\d+(\.\d+)?$/.test(line)
  );

  const entryPrice = numericLines[0] || "";
  const exitPrice = numericLines[1] || "";
  const capitalUsd = numericLines[2] || "";
  const realizedPnl = numericLines[numericLines.length - 2] || "";

  return {
    instrument,
    direction,
    capital_usd: parseAmount(capitalUsd),
    opened_at: openDate?.value || "",
    closed_at: closeDate?.value || "",
    entry_price: parseAmount(entryPrice),
    exit_price: parseAmount(exitPrice),
    leverage,
    pnl_qty: parseAmount(realizedPnl),
    exchange: "Bingx",
    is_capital_held: true,
    destination: direction === "SHORT" ? "HOLD_USDT" : "HOLD_COIN",
  };
}

function formatNumber(value, digits = 2) {
  const n = toNumber(value);
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function formatPercent(value) {
  return `${formatNumber(toNumber(value) * 100, 2)}%`;
}

function formatUsd(value) {
  const n = toNumber(value);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
}

function fieldClass() {
  return [
    "w-full rounded-2xl border border-slate-800 bg-slate-900/80",
    "px-5 py-4 text-base text-slate-100 outline-none",
    "placeholder:text-slate-500",
    "focus:border-cyan-500/60 focus:bg-slate-900",
    "transition-colors",
  ].join(" ");
}

function labelClass() {
  return "mb-2 block text-sm font-medium text-slate-300";
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className={labelClass()}>{label}</span>
      {children}
      {hint ? <div className="mt-2 text-xs text-slate-500">{hint}</div> : null}
    </label>
  );
}

function PreviewRow({ label, value, valueClassName = "text-slate-100" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 py-3 last:border-b-0">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`text-right text-sm font-semibold ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}

function pillClass(value) {
  const normalized = String(value || "").toUpperCase();

  if (normalized === "LONG") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (normalized === "SHORT") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }

  if (normalized === "HOLD_COIN") {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  }

  if (normalized === "HOLD_USDT") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  if (normalized === "TO_INVESTMENT") {
    return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  }

  if (normalized === "WITHDRAWN") {
    return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }

  return "border-slate-700 bg-slate-900 text-slate-300";
}

function Pill({ children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${pillClass(
        children
      )}`}
    >
      {children || "-"}
    </span>
  );
}

export default function TradingModal({
  open,
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}) {
  const [pasteText, setPasteText] = useState("");
  const [parseMessage, setParseMessage] = useState("");

  const derived = useMemo(() => {
    const direction = String(form.direction || "LONG").toUpperCase();
    const instrument = String(form.instrument || "").toUpperCase();

    const contract_type = direction === "SHORT" ? "USD_MONEDA" : "M_MONEDA";
    const settlement_asset = direction === "SHORT" ? "USDT" : instrument || "-";
    const default_destination =
      direction === "SHORT" ? "HOLD_USDT" : "HOLD_COIN";

    const holding_days = daysBetween(form.opened_at, form.closed_at);
    const pnl_pct = calculatePnlPct(form);
    const pnl_qty = toNumber(form.pnl_qty);
    const pnlPositive = pnl_qty >= 0;

    return {
      contract_type,
      settlement_asset,
      default_destination,
      holding_days,
      pnl_pct,
      pnl_qty,
      pnlPositive,
    };
  }, [form]);

  if (!open) return null;

  const destinationValue = form.destination || derived.default_destination;

  const handleAutofillFromPaste = () => {
    const parsed = parseBingxTradeText(pasteText);

    if (!parsed.instrument || !parsed.entry_price || !parsed.exit_price) {
      setParseMessage(
        "No pude detectar instrumento, precio de entrada o precio de cierre. Revisá el texto pegado."
      );
      return;
    }

    Object.entries(parsed).forEach(([field, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        onChange(field, value);
      }
    });

    setParseMessage("Operación detectada y formulario autocompletado.");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const payload = {
      ...form,
      instrument: String(form.instrument || "").toUpperCase(),
      direction: String(form.direction || "LONG").toUpperCase(),
      holding_days: derived.holding_days,
      pnl_pct: derived.pnl_pct,
      destination: destinationValue,
    };

    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-6 border-b border-slate-800 px-7 py-6">
          <div>
            <h2 className="text-3xl font-semibold text-white">
              Nueva operación trading
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-400">
              Cargá la operación cerrada. Podés pegar el detalle copiado desde
              BingX para autocompletar los campos principales.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-8 px-7 py-7 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            {error ? (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mb-6 rounded-[1.5rem] border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    Pegar operación de BingX
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Pegá el texto copiado desde el detalle de la operación y tocá Autocompletar.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAutofillFromPaste}
                  className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                >
                  Autocompletar
                </button>
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  setParseMessage("");
                }}
                className="mt-4 min-h-32 w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/60"
                placeholder={`Open Time
Close Time
Futures
...
2026-03-28 12:07:57
2026-04-12 10:56:28
ADAUSDT
Short
Isolated
5X
0.2515
USDT
0.2380
USDT
...`}
              />

              {parseMessage ? (
                <div className="mt-3 text-sm text-slate-400">
                  {parseMessage}
                </div>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Instrumento">
                <select
                  required
                  value={form.instrument}
                  onChange={(e) => onChange("instrument", e.target.value)}
                  className={fieldClass()}
                >
                  <option value="">Seleccionar</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="ADA">ADA</option>
                  <option value="SOL">SOL</option>
                </select>
              </Field>

              <Field label="Dirección">
                <select
                  value={form.direction}
                  onChange={(e) => onChange("direction", e.target.value)}
                  className={fieldClass()}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </Field>

              <Field label="Fecha apertura">
                <input
                  required
                  type="date"
                  value={form.opened_at}
                  onChange={(e) => onChange("opened_at", e.target.value)}
                  className={fieldClass()}
                />
              </Field>

              <Field label="Fecha cierre" hint={`${derived.holding_days} días`}>
                <input
                  required
                  type="date"
                  value={form.closed_at}
                  onChange={(e) => onChange("closed_at", e.target.value)}
                  className={fieldClass()}
                />
              </Field>

              <Field label="Capital USD">
                <input
                  required
                  type="number"
                  step="0.000001"
                  value={form.capital_usd}
                  onChange={(e) => onChange("capital_usd", e.target.value)}
                  className={fieldClass()}
                  placeholder="Ej: 1000"
                />
              </Field>

              <Field label="Apalancamiento">
                <input
                  required
                  type="number"
                  step="0.01"
                  value={form.leverage}
                  onChange={(e) => onChange("leverage", e.target.value)}
                  className={fieldClass()}
                  placeholder="Ej: 5"
                />
              </Field>

              <Field label="Precio apertura">
                <input
                  required
                  type="number"
                  step="0.000001"
                  value={form.entry_price}
                  onChange={(e) => onChange("entry_price", e.target.value)}
                  className={fieldClass()}
                  placeholder="Entry price"
                />
              </Field>

              <Field label="Precio cierre">
                <input
                  required
                  type="number"
                  step="0.000001"
                  value={form.exit_price}
                  onChange={(e) => onChange("exit_price", e.target.value)}
                  className={fieldClass()}
                  placeholder="Exit price"
                />
              </Field>

              <Field
                label="PnL qty"
                hint={
                  derived.settlement_asset === "USDT"
                    ? "Resultado liquidado en USDT"
                    : `Resultado retenido en ${derived.settlement_asset}`
                }
              >
                <input
                  required
                  type="number"
                  step="0.00000001"
                  value={form.pnl_qty}
                  onChange={(e) => onChange("pnl_qty", e.target.value)}
                  className={fieldClass()}
                  placeholder="Ej: 0.10 / 150.25"
                />
              </Field>

              <Field label="Exchange">
                <input
                  value={form.exchange}
                  onChange={(e) => onChange("exchange", e.target.value)}
                  className={fieldClass()}
                  placeholder="Ej: Bingx"
                />
              </Field>

              <Field label="Destino">
                <select
                  value={destinationValue}
                  onChange={(e) => onChange("destination", e.target.value)}
                  className={fieldClass()}
                >
                  <option value="HOLD_COIN">HOLD_COIN</option>
                  <option value="HOLD_USDT">HOLD_USDT</option>
                  <option value="TO_INVESTMENT">TO_INVESTMENT</option>
                  <option value="WITHDRAWN">WITHDRAWN</option>
                </select>
              </Field>

              <Field label="Capital retenido">
                <select
                  value={form.is_capital_held ? "true" : "false"}
                  onChange={(e) =>
                    onChange("is_capital_held", e.target.value === "true")
                  }
                  className={fieldClass()}
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <Field label="Notas">
                <textarea
                  value={form.notes}
                  onChange={(e) => onChange("notes", e.target.value)}
                  className={`${fieldClass()} min-h-28 resize-none`}
                  placeholder="Comentario opcional..."
                />
              </Field>
            </div>

            <div className="mt-7 flex justify-end gap-3 border-t border-slate-800 pt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-2xl border border-slate-700 px-6 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar operación"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-6">
            <h3 className="text-2xl font-semibold text-white">
              Preview de inserción
            </h3>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Esta preview usa la misma lógica que el alta real: los SHORT se
              liquidan en USDT y los LONG M-moneda quedan en el subyacente.
            </p>

            <div className="mt-6 rounded-2xl bg-slate-950/80 p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <Pill>{form.direction}</Pill>
                <Pill>{destinationValue}</Pill>
                <Pill>{derived.contract_type}</Pill>
              </div>

              <PreviewRow
                label="Instrumento"
                value={form.instrument || "-"}
              />

              <PreviewRow
                label="Contrato"
                value={derived.contract_type}
              />

              <PreviewRow
                label="Settlement"
                value={derived.settlement_asset}
              />

              <PreviewRow
                label="Capital USD"
                value={formatUsd(form.capital_usd)}
              />

              <PreviewRow
                label="PnL qty"
                value={`${formatNumber(derived.pnl_qty, 8)} ${derived.settlement_asset}`}
                valueClassName={derived.pnlPositive ? "text-emerald-400" : "text-red-400"}
              />

              <PreviewRow
                label="PnL %"
                value={formatPercent(derived.pnl_pct)}
                valueClassName={derived.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}
              />

              <PreviewRow
                label="Días"
                value={derived.holding_days}
              />

              <PreviewRow
                label="Exchange"
                value={form.exchange || "-"}
              />

              <PreviewRow
                label="Source"
                value="manual_app"
              />
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm leading-6 text-slate-500">
              El valor final en USD se calcula en BigQuery desde
              <span className="text-slate-300"> vw_trading_trades_valued</span>.
              Para USDT usa el resultado directo; para M-moneda usa el precio
              actual del settlement asset.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
