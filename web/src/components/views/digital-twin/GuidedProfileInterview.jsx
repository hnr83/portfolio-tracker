import React, { useState } from "react";
import { apiFetch } from "../../../utils/api";

export default function GuidedProfileInterview({ context, onProposal }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState(null);

  async function callInterview(nextMessages) {
    setLoading(true); setError("");
    try {
      const response = await apiFetch("/api/digital-twin/investor-profile/interview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.code === "OPENAI_NOT_CONFIGURED" ? "Falta configurar OPENAI_API_KEY en el backend." : data?.error || `HTTP ${response.status}`);
      const assistantText = data.question || data.message || "";
      const withAssistant = assistantText ? [...nextMessages, { role: "assistant", content: assistantText }] : nextMessages;
      setMessages(withAssistant);
      if (data.phase === "proposal" && data.proposal) setProposal(data.proposal);
    } catch (err) { setError(err.message || "No se pudo continuar la conversación."); }
    finally { setLoading(false); }
  }

  async function start() { setProposal(null); await callInterview([]); }
  async function send() {
    const text = draft.trim(); if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }]; setMessages(next); setDraft(""); await callInterview(next);
  }

  return <div className="rounded-[22px] border border-indigo-400/20 bg-gradient-to-br from-indigo-500/[0.08] via-slate-900/80 to-slate-950/90 p-5 shadow-[0_16px_45px_rgba(0,0,0,0.22)]">
    <div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold text-white">Construí tu perfil conversando</div><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">El Twin te va a hacer pocas preguntas adaptativas usando tu cartera y tu plan. No busca asignarte un score de riesgo: busca entender cómo decidís.</p></div><span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-indigo-200">LLM</span></div>
    {messages.length === 0 ? <button onClick={start} disabled={loading} className="mt-5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2.5 text-xs font-medium text-white shadow-lg shadow-indigo-950/30 disabled:opacity-50">{loading ? "Preparando..." : "Empezar conversación guiada"}</button> : <>
      <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">{messages.map((m,i) => <div key={i} className={m.role === "user" ? "ml-auto max-w-[82%] rounded-2xl rounded-br-md border border-blue-400/10 bg-blue-500/[0.08] px-4 py-3 text-xs leading-5 text-slate-300" : "max-w-[88%] rounded-2xl rounded-bl-md border border-indigo-400/15 bg-slate-950/55 px-4 py-3 text-xs leading-5 text-slate-300"}>{m.content}</div>)}</div>
      {!proposal && <div className="mt-4 flex gap-2"><textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Respondé con tus palabras..." className="min-w-0 flex-1 resize-none rounded-xl border border-slate-700/70 bg-slate-950 px-3 py-2.5 text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500" /><button onClick={send} disabled={!draft.trim() || loading} className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 text-sm text-white disabled:opacity-40">{loading ? "…" : "➤"}</button></div>}
    </>}
    {proposal && <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">Esto es lo que entendí de vos</div><p className="mt-3 whitespace-pre-line text-xs leading-6 text-slate-300">{proposal.investor_narrative}</p><div className="mt-4 flex flex-wrap gap-2">{[proposal.style, proposal.concentration_tolerance, proposal.drawdown_tolerance, proposal.implementation_style].filter(Boolean).map((x) => <span key={x} className="rounded-full border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-[10px] text-slate-300">{x}</span>)}</div><button onClick={() => onProposal?.(proposal)} className="mt-4 rounded-xl bg-gradient-to-r from-emerald-500/90 to-cyan-500/90 px-4 py-2.5 text-xs font-medium text-slate-950">Usar esta propuesta en mi perfil</button></div>}
    {error && <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-300">{error}</div>}
  </div>;
}
