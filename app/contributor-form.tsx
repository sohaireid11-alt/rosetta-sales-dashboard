"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  defaultFieldSettings,
  firstActiveValue,
  visibleOptions,
  type FieldOption,
  type FieldSettings,
} from "./lib/field-settings-core";
import { PENDING_STAGE, SCHEDULED_INTERPRETATION_SERVICE } from "./sales-config";

type ContributorFormProps = { displayName: string; email: string };

function today() { return new Date().toISOString().slice(0, 10); }

function optionNodes(options: FieldOption[] | undefined, currentValue?: string) {
  return visibleOptions(options, currentValue).map((option) => <option key={option.value} value={option.value}>{option.label}</option>);
}

function emptyForm(displayName: string, settings: FieldSettings = defaultFieldSettings()) {
  const lists = settings.lists;
  const service = firstActiveValue(lists.services, SCHEDULED_INTERPRETATION_SERVICE);
  const isScheduled = service === SCHEDULED_INTERPRETATION_SERVICE;
  return {
    leadName: "", company: "", organizationType: firstActiveValue(lists.organizationTypes, "Individual"), sourceType: firstActiveValue(lists.sourceTypes, "Direct enquiry"), referredBy: "", requestReceivedBy: displayName,
    service, serviceDelivery: isScheduled ? firstActiveValue(lists.interpretationDeliveries, "In-person") : "", interpretationMode: isScheduled ? firstActiveValue(lists.interpretationModes, "Consecutive") : "", stage: firstActiveValue(lists.statuses, "New"), dealValue: "", createdAt: today(),
    contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", meetingStage: firstActiveValue(lists.meetingStages, "No meeting yet"), nextMeetingAt: "", nextFollowUpAt: "", nextAction: "", initialNote: "",
    opportunityType: firstActiveValue(lists.opportunityTypes, "One-time project"), closedAt: "",
  };
}

export function ContributorForm({ displayName, email }: ContributorFormProps) {
  const [fieldSettings, setFieldSettings] = useState<FieldSettings>(defaultFieldSettings);
  const [form, setForm] = useState(() => emptyForm(displayName));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/field-settings", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as FieldSettings;
      if (!response.ok) return;
      setFieldSettings(payload);
      setForm((current) => current.leadName || current.company ? current : emptyForm(displayName, payload));
    }).catch(() => undefined);
  }, [displayName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, dealValue: Number(form.dealValue) }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to add the sales record.");
      setForm(emptyForm(displayName, fieldSettings)); setNotice("Sales record added.");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Unable to add the sales record."); }
    finally { setIsSaving(false); }
  }

  const lists = fieldSettings.lists;
  const addLabel = fieldSettings.labels.ctaAddSalesRecord;

  return <main className="access-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">New sales record</span></div>
      <form action="/api/auth/logout" method="post"><button className="secondary-action" type="submit">Sign out</button></form>
    </header>
    <section className="contributor-workspace">
      <div className="access-heading">
        <p className="eyebrow">Rosetta Languages</p>
        <h1>{addLabel}</h1>
        <p className="heading-copy">Signed in as {displayName} ({email})</p>
      </div>
      <form className="contributor-card" onSubmit={submit}>
        <div className="form-grid">
          <label>Lead name<input required value={form.leadName} onChange={(event) => setForm({ ...form, leadName: event.target.value })} placeholder="Person or organization" /></label>
          <label>Company <span className="optional">Optional</span><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
          <label>Organization type<select value={form.organizationType} onChange={(event) => setForm({ ...form, organizationType: event.target.value })}>{optionNodes(lists.organizationTypes, form.organizationType)}</select></label>
          <label>Source type<select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}>{optionNodes(lists.sourceTypes, form.sourceType)}</select></label>
          <label>Service<select value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value, serviceDelivery: event.target.value === SCHEDULED_INTERPRETATION_SERVICE ? form.serviceDelivery || firstActiveValue(lists.interpretationDeliveries, "In-person") : "", interpretationMode: event.target.value === SCHEDULED_INTERPRETATION_SERVICE ? form.interpretationMode || firstActiveValue(lists.interpretationModes, "Consecutive") : "" })}>{optionNodes(lists.services, form.service)}</select></label>
          <label>Status<select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{optionNodes(lists.statuses, form.stage)}</select></label>
          {form.service === SCHEDULED_INTERPRETATION_SERVICE ? <>
            <label>Delivery<select value={form.serviceDelivery} onChange={(event) => setForm({ ...form, serviceDelivery: event.target.value })}>{optionNodes(lists.interpretationDeliveries, form.serviceDelivery)}</select></label>
            <label>Interpretation mode<select value={form.interpretationMode} onChange={(event) => setForm({ ...form, interpretationMode: event.target.value })}>{optionNodes(lists.interpretationModes, form.interpretationMode)}</select></label>
          </> : null}
          <label>Deal value (USD)<input required inputMode="decimal" type="number" min="0" step="0.01" value={form.dealValue} onChange={(event) => setForm({ ...form, dealValue: event.target.value })} /></label>
          <label>Lead date<input required type="date" value={form.createdAt} onChange={(event) => setForm({ ...form, createdAt: event.target.value })} /></label>
          <label>Meeting stage<select value={form.meetingStage} onChange={(event) => setForm({ ...form, meetingStage: event.target.value })}>{optionNodes(lists.meetingStages, form.meetingStage)}</select></label>
          <label>Next meeting date <span className="optional">Optional</span><input type="date" value={form.nextMeetingAt} onChange={(event) => setForm({ ...form, nextMeetingAt: event.target.value })} /></label>
          <label>Date of next follow-up{form.stage === PENDING_STAGE ? null : <span className="optional"> Optional</span>}<input required={form.stage === PENDING_STAGE} type="date" value={form.nextFollowUpAt} onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })} /></label>
          <label>Action needed{form.stage === PENDING_STAGE ? null : <span className="optional"> Optional</span>}<select required={form.stage === PENDING_STAGE} value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })}><option value="">Select next action</option>{optionNodes(lists.followUpActions, form.nextAction)}</select></label>
          <label className="wide-field">First activity note <span className="optional">Optional</span><textarea rows={3} value={form.initialNote} onChange={(event) => setForm({ ...form, initialNote: event.target.value })} /></label>
        </div>
        {notice ? <p className="notice contributor-notice" role="status">{notice}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions"><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Adding..." : addLabel}</button></div>
      </form>
    </section>
  </main>;
}
