import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../utils/api";
import { formatPortfolioPercent } from "../../../utils/formatters";

const EMPTY_PROFILE = {
  style: "", concentration_tolerance: "", drawdown_tolerance: "", liquidity_preference: "",
  implementation_style: "", convictions: [], rules: [], notes: "", investor_narrative: "",
};

const OPTIONS = {
  style: ["Crecimiento", "Balanceado", "Preservación"],
  concentration_tolerance: ["Baja", "Media", "Alta", "Alta con convicción"],
  drawdown_tolerance: ["Baja", "Media", "Alta"],
  liquidity_preference: ["Baja", "Media", "Alta", "Oportunista"],
  implementation_style: ["DCA", "Híbrida · DCA + oportunista", "Entradas oportunistas", "Concentrado por tesis"],
};

function listToText(value) { return Array.isArray(value) ? value.join("\n") : ""; }
function textToList(value) { return String(value || "").split("\n").map((item) => item.trim()).filter(Boolean); }

export default function InvestorModelPanel({ observed, onProfileChange }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const response = await apiFetch("/api/digital-twin/investor-profile");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          const next = { ...EMPTY_PROFILE, ...data };
          setProfile(next);
          onProfileChange?.(next);
        }
      } catch (err) {
        console.error("Error loading Investor Model:", err);
        if (!cancelled) setError("No se pudo cargar el Investor Model.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [onProfileChange]);

  const completedFields = useMemo(() => [
    profile.style, profile.concentration_tolerance, profile.drawdown_tolerance,
    profile.liquidity_preference, profile.implementation_style,
  ].filter(Boolean).length, [profile]);

  const summaryItems = [
    ["Estilo", profile.style],
    ["Concentración", profile.concentration_tolerance],
    ["Drawdown", profile.drawdown_tolerance],
    ["Liquidez", profile.liquidity_preference],
    ["Implementación", profile.implementation_style],
  ].filter(([, value]) => value);

  function updateField(field, value) {
    setSaved(false);
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile() {
    try {
      setSaving(true); setError(""); setSaved(false);
      const response = await apiFetch("/api/digital-twin/investor-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const next = { ...EMPTY_PROFILE, ...data };
      setProfile(next);
      onProfileChange?.(next);
      setSaved(true);
      setEditing(false);
      setShowAdvanced(false);
    } catch (err) {
      console.error("Error saving Investor Model:", err);
      setError("No se pudo guardar el Investor Model.");
    } finally { setSaving(false); }
  }

  return (
    <section className="mt-5 rounded-[22px] border border-slate-800/80 bg-slate-950/45 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-white">Tu perfil · Digital Twin</div>
          <div className="mt-1 text-xs text-slate-500">Quién sos como inversor, sin convertirlo en un test de broker.</div>
        </div>
        <button type="button" onClick={() => setEditing((value) => !value)} className="shrink-0 text-xs font-medium text-indigo-300 hover:text-indigo-200">
          {editing ? "Cerrar" : profile.investor_narrative || completedFields ? "Ver / Editar →" : "Construir perfil →"}
        </button>
      </div>

      {!editing ? (
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Cómo pienso como inversor</div>
            {profile.investor_narrative ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{profile.investor_narrative}</p>
            ) : (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Todavía no construimos la narrativa de tu Investor Model. La idea es hacerlo conversando con el Twin, no llenando un cuestionario rígido.</p>
            )}

            {summaryItems.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {summaryItems.map(([label, value]) => (
                  <span key={label} className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-400">
                    <span className="text-slate-600">{label}</span> · <span className="text-slate-300">{value}</span>
                  </span>
                ))}
              </div>
            )}

            {(profile.convictions?.length > 0 || profile.rules?.length > 0) && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {profile.convictions?.length > 0 && <MiniList title="Convicciones" items={profile.convictions} />}
                {profile.rules?.length > 0 && <MiniList title="Principios" items={profile.rules} />}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-[#020617] p-4">
            <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Observado ahora</div><span className="text-[10px] text-emerald-300">Contexto real</span></div>
            <div className="mt-4 space-y-3 text-xs">
              <ObservedRow label="Mayor exposición" value={`${observed?.topTicker || "-"} · ${formatPortfolioPercent(observed?.topWeight || 0)}`} />
              <ObservedRow label="Crypto" value={formatPortfolioPercent(observed?.cryptoWeight || 0)} />
              <ObservedRow label="Liquidez" value={formatPortfolioPercent(observed?.liquidityWeight || 0)} />
              <ObservedRow label="Plan de referencia" value={observed?.scenarioName || "Sin referencia"} />
            </div>
            <div className="mt-4 border-t border-slate-800/70 pt-4 text-xs leading-5 text-slate-500">El Twin podrá comparar esto con lo que declarás, pero nunca cambiará tu perfil silenciosamente.</div>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5">
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-300">Cómo pienso como inversor</div>
              <textarea rows={7} value={profile.investor_narrative || ""} onChange={(e) => updateField("investor_narrative", e.target.value)} placeholder="Contale al Twin qué buscás, cuándo aceptás concentración, qué cambia una tesis, cómo usás la liquidez y qué esperás que cuestione..." className="mt-2 w-full resize-y rounded-2xl border border-slate-700/70 bg-[#020617] px-4 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500" />
              <div className="mt-3 text-xs text-slate-500">Más adelante el LLM va a construir y refinar este texto conversando con vos. Por ahora podés editarlo directamente.</div>
            </div>

            <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-300">Conversación guiada · próximo paso</div>
              <p className="mt-3 text-xs leading-5 text-slate-400">Pocas preguntas abiertas, adaptativas y conectadas con tu cartera real. El resultado será una propuesta de narrativa, convicciones y principios para que vos confirmes o corrijas.</p>
            </div>
          </div>

          <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="mt-5 flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300">
            <span>{showAdvanced ? "▾" : "▸"}</span>
            <span>Resumen estructurado y principios</span>
            <span className="text-slate-600">· {completedFields}/5</span>
          </button>

          {showAdvanced && (
            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-950/35 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField label="Estilo" value={profile.style} options={OPTIONS.style} onChange={(v) => updateField("style", v)} />
                <SelectField label="Concentración" value={profile.concentration_tolerance} options={OPTIONS.concentration_tolerance} onChange={(v) => updateField("concentration_tolerance", v)} />
                <SelectField label="Drawdown" value={profile.drawdown_tolerance} options={OPTIONS.drawdown_tolerance} onChange={(v) => updateField("drawdown_tolerance", v)} />
                <SelectField label="Liquidez" value={profile.liquidity_preference} options={OPTIONS.liquidity_preference} onChange={(v) => updateField("liquidity_preference", v)} />
                <div className="sm:col-span-2"><SelectField label="Implementación" value={profile.implementation_style} options={OPTIONS.implementation_style} onChange={(v) => updateField("implementation_style", v)} /></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <TextArea label="Convicciones / tesis" placeholder="Una por línea" value={listToText(profile.convictions)} onChange={(v) => updateField("convictions", textToList(v))} />
                <TextArea label="Principios / reglas" placeholder="Una por línea" value={listToText(profile.rules)} onChange={(v) => updateField("rules", textToList(v))} />
              </div>
              <div className="mt-3"><TextArea label="Matices adicionales" placeholder="Excepciones o contexto adicional" value={profile.notes} onChange={(v) => updateField("notes", v)} rows={2} /></div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={saveProfile} disabled={loading || saving} className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar perfil"}</button>
            {saved && <span className="text-xs text-emerald-300">Guardado</span>}
            {error && <span className="text-xs text-amber-300">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function MiniList({ title, items }) { return <div><div className="text-[10px] uppercase tracking-[0.15em] text-slate-600">{title}</div><div className="mt-2 space-y-1.5">{items.slice(0, 3).map((item) => <div key={item} className="text-xs leading-5 text-slate-400">• {item}</div>)}</div></div>; }
function SelectField({ label, value, options, onChange }) { return <label className="block"><span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span><select value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700/70 bg-[#020617] px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"><option value="">Elegir...</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>; }
function TextArea({ label, value, onChange, placeholder, rows = 3 }) { return <label className="block"><span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span><textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full resize-y rounded-xl border border-slate-700/70 bg-[#020617] px-3 py-2.5 text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500" /></label>; }
function ObservedRow({ label, value }) { return <div className="flex items-start justify-between gap-4"><span className="text-slate-500">{label}</span><span className="text-right text-slate-200">{value}</span></div>; }
