import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../utils/api";
import { formatPortfolioPercent } from "../../../utils/formatters";

const EMPTY_PROFILE = {
  style: "",
  concentration_tolerance: "",
  drawdown_tolerance: "",
  liquidity_preference: "",
  implementation_style: "",
  convictions: [],
  rules: [],
  notes: "",
};

const OPTIONS = {
  style: ["Crecimiento", "Balanceado", "Preservación"],
  concentration_tolerance: ["Baja", "Media", "Alta", "Alta con convicción"],
  drawdown_tolerance: ["Baja", "Media", "Alta"],
  liquidity_preference: ["Baja", "Media", "Alta", "Oportunista"],
  implementation_style: ["DCA", "Mixto", "Entradas oportunistas", "Concentrado por tesis"],
};

function listToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function textToList(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function InvestorModelPanel({ observed, onProfileChange }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        setLoading(true);
        setError("");
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, [onProfileChange]);

  const completedFields = useMemo(() => [
    profile.style,
    profile.concentration_tolerance,
    profile.drawdown_tolerance,
    profile.liquidity_preference,
    profile.implementation_style,
  ].filter(Boolean).length, [profile]);

  function updateField(field, value) {
    setSaved(false);
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile() {
    try {
      setSaving(true);
      setError("");
      setSaved(false);
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
    } catch (err) {
      console.error("Error saving Investor Model:", err);
      setError("No se pudo guardar el Investor Model.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-[22px] border border-slate-800 bg-[#020617] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Quién soy · Investor Model</div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
            Lo que declarás queda separado de lo que el Twin observa en tu cartera. El sistema puede señalar diferencias, pero no cambia tu perfil silenciosamente.
          </p>
        </div>
        <span className="w-fit rounded-full border border-indigo-400/15 bg-indigo-500/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-indigo-300">
          {loading ? "Cargando" : `${completedFields}/5 declarado`}
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">Declarado por vos</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Estilo" value={profile.style} options={OPTIONS.style} onChange={(value) => updateField("style", value)} />
            <SelectField label="Concentración" value={profile.concentration_tolerance} options={OPTIONS.concentration_tolerance} onChange={(value) => updateField("concentration_tolerance", value)} />
            <SelectField label="Tolerancia a drawdown" value={profile.drawdown_tolerance} options={OPTIONS.drawdown_tolerance} onChange={(value) => updateField("drawdown_tolerance", value)} />
            <SelectField label="Preferencia de liquidez" value={profile.liquidity_preference} options={OPTIONS.liquidity_preference} onChange={(value) => updateField("liquidity_preference", value)} />
            <div className="sm:col-span-2"><SelectField label="Implementación" value={profile.implementation_style} options={OPTIONS.implementation_style} onChange={(value) => updateField("implementation_style", value)} /></div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextArea label="Convicciones / tesis" placeholder="Una por línea. Ej: BTC como reserva de valor de largo plazo" value={listToText(profile.convictions)} onChange={(value) => updateField("convictions", textToList(value))} />
            <TextArea label="Reglas explícitas" placeholder="Una por línea. Ej: no aumentar una tesis si cambió el fundamento" value={listToText(profile.rules)} onChange={(value) => updateField("rules", textToList(value))} />
          </div>
          <div className="mt-3"><TextArea label="Notas" placeholder="Matices que el Twin debería conocer sobre tu forma de decidir" value={profile.notes} onChange={(value) => updateField("notes", value)} rows={2} /></div>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={saveProfile} disabled={loading || saving} className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar Investor Model"}
            </button>
            {saved && <span className="text-xs text-emerald-300">Guardado</span>}
            {error && <span className="text-xs text-amber-300">{error}</span>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/45 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Observado por el sistema</div>
            <div className="mt-4 space-y-3 text-xs">
              <ObservedRow label="Mayor concentración" value={`${observed?.topTicker || "-"} · ${formatPortfolioPercent(observed?.topWeight || 0)}`} />
              <ObservedRow label="Exposición crypto" value={formatPortfolioPercent(observed?.cryptoWeight || 0)} />
              <ObservedRow label="Liquidez" value={formatPortfolioPercent(observed?.liquidityWeight || 0)} />
              <ObservedRow label="Escenario de referencia" value={observed?.scenarioName || "Sin referencia"} />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">Interpretación actual del Twin</div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Pendiente del motor de razonamiento. En esta etapa guardamos tu perfil declarado y mantenemos las observaciones determinísticas separadas; el LLM después podrá comparar ambas capas sin reescribir tus preferencias.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500">
        <option value="">Elegir...</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full resize-y rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500" />
    </label>
  );
}

function ObservedRow({ label, value }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-slate-500">{label}</span><span className="text-right text-slate-200">{value}</span></div>;
}
