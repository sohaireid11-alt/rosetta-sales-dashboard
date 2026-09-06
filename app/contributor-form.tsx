"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  applySalesFieldChange,
  emptySalesValues,
  payloadFromSalesValues,
  salesFieldRequired,
  salesFields,
  sectionTitle,
  showSalesField,
  type SalesFormValues,
} from "./lib/form-runtime";
import { defaultFieldSettings, type FieldSettings } from "./lib/field-settings-core";
import { SchemaField } from "./schema-field";

type ContributorFormProps = { displayName: string; email: string };

function today() { return new Date().toISOString().slice(0, 10); }

function emptyForm(displayName: string, settings: FieldSettings = defaultFieldSettings()) {
  return emptySalesValues(settings, { createdAt: today(), requestReceivedBy: displayName });
}

export function ContributorForm({ displayName, email }: ContributorFormProps) {
  const [fieldSettings, setFieldSettings] = useState<FieldSettings>(defaultFieldSettings);
  const [form, setForm] = useState<SalesFormValues>(() => emptyForm(displayName));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/field-settings", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as FieldSettings;
      if (!response.ok) return;
      setFieldSettings({ ...defaultFieldSettings(), ...payload, fields: payload.fields ?? defaultFieldSettings().fields, views: payload.views ?? defaultFieldSettings().views, sections: payload.sections ?? defaultFieldSettings().sections });
      setForm((current) => current.leadName || current.company ? current : emptyForm(displayName, { ...defaultFieldSettings(), ...payload }));
    }).catch(() => undefined);
  }, [displayName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadFromSalesValues(form)) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to add the sales record.");
      setForm(emptyForm(displayName, fieldSettings)); setNotice("Sales record added.");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Unable to add the sales record."); }
    finally { setIsSaving(false); }
  }

  const lists = fieldSettings.lists;
  const labels = fieldSettings.labels;
  const addLabel = labels.ctaAddSalesRecord;
  const visible = salesFields(fieldSettings, true);
  const sections = ["sales_lead", "sales_contact", "sales_service", "sales_next"] as const;

  return <main className="access-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{addLabel}</span></div>
      <form action="/api/auth/logout" method="post"><button className="secondary-action" type="submit">{labels.navSignOut}</button></form>
    </header>
    <section className="contributor-workspace">
      <div className="access-heading">
        <p className="eyebrow">{labels.eyebrowRosetta}</p>
        <h1>{addLabel}</h1>
        <p className="heading-copy">Signed in as {displayName} ({email})</p>
      </div>
      <form className="contributor-card" onSubmit={submit}>
        {sections.map((sectionKey) => {
          const sectionFields = visible.filter((field) => field.sectionKey === sectionKey && showSalesField(field, form, false));
          if (!sectionFields.length) return null;
          return <div className="form-section" key={sectionKey}>
            <h3>{sectionTitle(fieldSettings, sectionKey, sectionKey)}</h3>
            <div className="form-grid">
              {sectionFields.map((field) => (
                <SchemaField
                  key={field.fieldKey}
                  field={field}
                  value={form[field.fieldKey] ?? (field.inputType === "multiselect" ? [] : "")}
                  options={field.listKey ? lists[field.listKey] : undefined}
                  extraOptions={field.fieldKey === "requestReceivedBy" ? [displayName, "Admin"] : []}
                  required={salesFieldRequired(field, form)}
                  optionalMark={labels.optionalMark}
                  selectPlaceholder={labels.selectPlaceholder}
                  onChange={(next) => setForm(applySalesFieldChange(form, field, next, fieldSettings))}
                />
              ))}
            </div>
          </div>;
        })}
        {notice ? <p className="notice contributor-notice" role="status">{notice}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions"><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? labels.formSaving : addLabel}</button></div>
      </form>
    </section>
  </main>;
}
