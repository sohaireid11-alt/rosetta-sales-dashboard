"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  FOLLOW_UP_ACTIONS,
  INTERPRETATION_DELIVERIES,
  INTERPRETATION_MODES,
  MEETING_STAGES,
  ORGANIZATION_TYPES,
  SERVICES,
  SOURCE_TYPES,
  STATUSES,
} from "./sales-config";

type ContributorFormProps = { displayName: string; email: string };

function today() { return new Date().toISOString().slice(0, 10); }

function emptyForm(displayName: string) {
  return {
    leadName: "", company: "", organizationType: "Individual", sourceType: "Direct enquiry", referredBy: "", requestReceivedBy: displayName,
    service: "Scheduled Interpretation", serviceDelivery: "In-person", interpretationMode: "Consecutive", stage: "New", dealValue: "", createdAt: today(),
    contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", meetingStage: "No meeting yet", nextMeetingAt: "", nextFollowUpAt: "", nextAction: "", initialNote: "",
    opportunityType: "One-time project", closedAt: "",
  };
}

export function ContributorForm({ displayName, email }: ContributorFormProps) {
  const [form, setForm] = useState(() => emptyForm(displayName));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, dealValue: Number(form.dealValue) }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to add the sales record.");
      setForm(emptyForm(displayName)); setNotice("Sales record added.");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Unable to add the sales record."); }
    finally { setIsSaving(false); }
  }

  return <main className="access-shell"><header className="topbar"><div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">New sales record</span></div><form action="/api/auth/logout" method="post"><button className="secondary-action" type="submit">Sign out</button></form></header><section className="contributor-workspace"><div className="access-heading"><p className="eyebrow">Rosetta Languages</p><h1>Add a sales record</h1><p className="heading-copy">Signed in as {displayName} ({email})</p></div><form className="contributor-card" onSubmit={submit}><div className="form-grid"><label>Lead name<input required value={form.leadName} onChange={(event) => setForm({ ...form, leadName: event.target.value })} placeholder="Person or organization" /></label><label>Company <span className="optional">Optional</span><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label><label>Organization type<select value={form.organizationType} onChange={(event) => setForm({ ...form, organizationType: event.target.value })}>{ORGANIZATION_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label><label>Source type<select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}>{SOURCE_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label><label>Service<select value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value, serviceDelivery: event.target.value === "Scheduled Interpretation" ? form.serviceDelivery : "", interpretationMode: event.target.value === "Scheduled Interpretation" ? form.interpretationMode : "" })}>{SERVICES.map((option) => <option key={option}>{option}</option>)}</select></label><label>Status<select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{STATUSES.map((option) => <option key={option}>{option}</option>)}</select></label>{form.service === "Scheduled Interpretation" ? <><label>Delivery<select value={form.serviceDelivery} onChange={(event) => setForm({ ...form, serviceDelivery: event.target.value })}>{INTERPRETATION_DELIVERIES.map((option) => <option key={option}>{option}</option>)}</select></label><label>Interpretation mode<select value={form.interpretationMode} onChange={(event) => setForm({ ...form, interpretationMode: event.target.value })}>{INTERPRETATION_MODES.map((option) => <option key={option}>{option}</option>)}</select></label></> : null}<label>Deal value (USD)<input required inputMode="decimal" type="number" min="0" step="0.01" value={form.dealValue} onChange={(event) => setForm({ ...form, dealValue: event.target.value })} /></label><label>Lead date<input required type="date" value={form.createdAt} onChange={(event) => setForm({ ...form, createdAt: event.target.value })} /></label><label>Meeting stage<select value={form.meetingStage} onChange={(event) => setForm({ ...form, meetingStage: event.target.value })}>{MEETING_STAGES.map((option) => <option key={option}>{option}</option>)}</select></label><label>Next meeting date <span className="optional">Optional</span><input type="date" value={form.nextMeetingAt} onChange={(event) => setForm({ ...form, nextMeetingAt: event.target.value })} /></label><label>Date of next follow-up{form.stage === "Pending" ? null : <span className="optional"> Optional</span>}<input required={form.stage === "Pending"} type="date" value={form.nextFollowUpAt} onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })} /></label><label>Action needed{form.stage === "Pending" ? null : <span className="optional"> Optional</span>}<select required={form.stage === "Pending"} value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })}><option value="">Select next action</option>{FOLLOW_UP_ACTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><label className="wide-field">First activity note <span className="optional">Optional</span><textarea rows={3} value={form.initialNote} onChange={(event) => setForm({ ...form, initialNote: event.target.value })} /></label></div>{notice ? <p className="notice contributor-notice" role="status">{notice}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Adding..." : "Add sales record"}</button></div></form></section></main>;
}
