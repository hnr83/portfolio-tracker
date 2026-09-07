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
  const [showStructured, setShowStructured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const response = await apiFetch("/api/digital-twin/investor-profile");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) { const next = { ...EMPTY_PROFILE, ...data }; setProfile(next); onProfileChange?.(next); }
      } catch (err) {
        console.error("Error loading Investor Model:", err);
        if (!cancelled) setError("No se pudo cargar el Investor Model.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [onProfileChange]);

  const completedFields = useMemo(() => [profile.style, profile.concentration_tolerance, profile.drawdown_tolerance, profile.liquidity_preference, profile.implementation_style].filter(Boolean).length, [profile]);
  function updateField(field, value) { setSaved(false); setProfile((current) => ({ ...current, [field]: value })); }

  async function saveProfile() {
    try {
      setSaving(true); setError(""); setSaved(false);
      const response = await apiFetch("/api/digital-twin/investor-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); const next = { ...EMPTY_PROFILE, ...data };
      setProfile(next); onProfileChange?.(next); setSaved(true);
    } catch (err) { console.error("Error saving Investor Model:", err); setError("No se pudo guardar el Investor Model."); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-5 rounded-[22px] border border-slate-800 bg-[#020617] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Quién soy · Investor Model</div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">No buscamos un test de broker. El núcleo es una descripción rica de cómo pensás y decidís; las categorías quedan como un resumen computable y lo observado por el sistema permanece separado.</p>
        </div>
        <span className="w-fit rounded-full border border-indigo-400/15 bg-indigo-500/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-indigo-300">{loading ? "Cargando" : profile.investor_narrative ? "Narrativa activa" : "Por construir"}</span>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.05] p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-300">Cómo pienso como inversor</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Este texto será el corazón de “Quién soy”. Más adelante una conversación guiada con el LLM lo propondrá y refinará; vos siempre vas a poder corregirlo.</p>
            <textarea rows={8} value={profile.investor_narrative || ""} onChange={(e) => updateField("investor_narrative", e.target.value)} placeholder="Describí con tus palabras qué buscás, cuándo aceptás concentración, cómo reaccionás a caídas, qué hace que una tesis cambie, cómo usás la liquidez y qué esperás que el Twin cuestione..." className="mt-3 w-full resize-y rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500" />
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
            <button type="button" onClick={() => setShowStructured((v) => !v)} className="flex w-full items-center justify-between text-left">
              <div><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Resumen estructurado</div><div className="mt-1 text-xs text-slate-500">{completedFields}/5 dimensiones · útil para contexto y comparación, no define por sí solo quién sos.</div></div>
              <span className="text-xs text-indigo-300">{showStructured ? "Ocultar" : "Editar"}</span>
            </button>
            {showStructured && <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SelectField label="Estilo" value={profile.style} options={OPTIONS.style} onChange={(v) => updateField("style", v)} />
              <SelectField label="Concentración" value={profile.concentration_tolerance} options={OPTIONS.concentration_tolerance} onChange={(v) => updateField("concentration_tolerance", v)} />
              <SelectField label="Tolerancia a drawdown" value={profile.drawdown_tolerance} options={OPTIONS.drawdown_tolerance} onChange={(v) => updateField("drawdown_tolerance", v)} />
              <SelectField label="Preferencia de liquidez" value={profile.liquidity_preference} options={OPTIONS.liquidity_preference} onChange={(v) => updateField("liquidity_preference", v)} />
              <div className="sm:col-span-2"><SelectField label="Implementación" value={profile.implementation_style} options={OPTIONS.implementation_style} onChange={(v) => updateField("implementation_style", v)} /></div>
            </div>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextArea label="Convicciones / tesis" placeholder="Una por línea. Ej: BTC como reserva de valor de largo plazo" value={listToText(profile.convictions)} onChange={(v) => updateField("convictions", textToList(v))} />
            <TextArea label="Principios / reglas explícitas" placeholder="Una por línea. Ej: una caída de precio no invalida por sí sola una tesis" value={listToText(profile.rules)} onChange={(v) => updateField("rules", textToList(v))} />
          </div>
          <div className="mt-3"><TextArea label="Matices adicionales" placeholder="Excepciones o contexto que no entra bien en las categorías anteriores" value={profile.notes} onChange={(v) => updateField("notes", v)} rows={2} /></div>

          <div className="flex items-center gap-3"><button type="button" onClick={saveProfile} disabled={loading || saving} className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar quién soy"}</button>{saved && <span className="text-xs text-emerald-300">Guardado</span>}{error && <span className="text-xs text-amber-300">{error}</span>}</div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/45 p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Observado por el sistema</div><div className="mt-4 space-y-3 text-xs"><ObservedRow label="Mayor concentración" value={`${observed?.topTicker || "-"} · ${formatPortfolioPercent(observed?.topWeight || 0)}`} /><ObservedRow label="Exposición crypto" value={formatPortfolioPercent(observed?.cryptoWeight || 0)} /><ObservedRow label="Liquidez" value={formatPortfolioPercent(observed?.liquidityWeight || 0)} /><ObservedRow label="Escenario de referencia" value={observed?.scenarioName || "Sin referencia"} /></div></div>
          <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">Próximo paso · conversación guiada</div><p className="mt-3 text-xs leading-5 text-slate-400">El LLM no te dará un score de riesgo. Te hará pocas preguntas abiertas y adaptativas, contrastará tus respuestas con tu cartera y tu plan, y propondrá una narrativa, principios y dimensiones para que vos confirmes o corrijas.</p></div>
          <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] p-4"><div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">Interpretación actual del Twin</div><p className="mt-3 text-xs leading-5 text-slate-400">Todavía pendiente. La interpretación será una capa derivada: podrá señalar tensiones entre lo declarado y lo observado, pero nunca reescribirá silenciosamente tu identidad inversora.</p></div>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) { return <label className="block"><span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span><select value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500"><option value="">Elegir...</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>; }
function TextArea({ label, value, onChange, placeholder, rows = 3 }) { return <label className="block"><span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span><textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full resize-y rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500" /></label>; }
function ObservedRow({ label, value }) { return <div className="flex items-start justify-between gap-4"><span className="text-slate-500">{label}</span><span className="text-right text-slate-200">{value}</span></div>; }
