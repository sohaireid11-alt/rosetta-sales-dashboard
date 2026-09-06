"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AccessGate } from "../access-gate";
import {
  defaultFieldSettings,
  type FieldOption,
  type FieldSettings,
  type UiLabels,
} from "../lib/field-settings-core";
import { FIELD_LIST_KEYS, FIELD_LIST_META, UI_LABEL_KEYS, UI_LABEL_META, type FieldListKey } from "../sales-config";

type AppRole = "admin" | "contributor";
type Session = {
  configured: boolean;
  user: { id: number; email: string; displayName: string; role: AppRole } | null;
};

function cloneSettings(settings: FieldSettings): FieldSettings {
  return {
    labels: { ...settings.labels },
    lists: Object.fromEntries(
      FIELD_LIST_KEYS.map((key) => [key, settings.lists[key].map((option) => ({ ...option }))])
    ) as FieldSettings["lists"],
  };
}

export default function FieldSettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<FieldSettings>(defaultFieldSettings);
  const [draft, setDraft] = useState<FieldSettings>(defaultFieldSettings);
  const [newLabels, setNewLabels] = useState<Record<FieldListKey, string>>(
    Object.fromEntries(FIELD_LIST_KEYS.map((key) => [key, ""])) as Record<FieldListKey, string>
  );
  const [savingList, setSavingList] = useState<FieldListKey | "labels" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const accessResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const access = await accessResponse.json() as Session;
    setSession(access);
    if (access.user?.role !== "admin") return;
    const settingsResponse = await fetch("/api/field-settings", { cache: "no-store" });
    const payload = await settingsResponse.json() as FieldSettings & { error?: string };
    if (!settingsResponse.ok) throw new Error(payload.error ?? "Unable to load field settings.");
    const next = cloneSettings(payload);
    setSettings(next);
    setDraft(cloneSettings(next));
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load field settings."));
  }, []);

  function updateOption(listKey: FieldListKey, index: number, patch: Partial<FieldOption>) {
    setDraft((current) => {
      const options = current.lists[listKey].map((option, optionIndex) => (
        optionIndex === index ? { ...option, ...patch } : option
      ));
      return { ...current, lists: { ...current.lists, [listKey]: options } };
    });
  }

  function moveOption(listKey: FieldListKey, index: number, direction: -1 | 1) {
    setDraft((current) => {
      const options = [...current.lists[listKey]];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= options.length) return current;
      const [moved] = options.splice(index, 1);
      options.splice(nextIndex, 0, moved);
      return { ...current, lists: { ...current.lists, [listKey]: options.map((option, sortOrder) => ({ ...option, sortOrder })) } };
    });
  }

  function addOption(listKey: FieldListKey) {
    const label = newLabels[listKey].trim();
    if (!label) return;
    setDraft((current) => {
      const options = [...current.lists[listKey], {
        id: 0,
        value: label,
        label,
        sortOrder: current.lists[listKey].length,
        isActive: true,
      }];
      return { ...current, lists: { ...current.lists, [listKey]: options } };
    });
    setNewLabels((current) => ({ ...current, [listKey]: "" }));
  }

  async function saveList(listKey: FieldListKey) {
    setSavingList(listKey);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/field-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listKey,
          options: draft.lists[listKey].map((option) => ({
            value: option.value,
            label: option.label,
            isActive: option.isActive,
          })),
        }),
      });
      const payload = await response.json() as FieldSettings & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save this picklist.");
      const next = cloneSettings(payload);
      setSettings(next);
      setDraft(cloneSettings(next));
      setNotice(`${FIELD_LIST_META[listKey].title} updated. New edits and dropdowns will use these options.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this picklist.");
    } finally {
      setSavingList(null);
    }
  }

  async function saveLabels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingList("labels");
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/field-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: draft.labels }),
      });
      const payload = await response.json() as FieldSettings & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save display labels.");
      const next = cloneSettings(payload);
      setSettings(next);
      setDraft(cloneSettings(next));
      setNotice("Display labels updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save display labels.");
    } finally {
      setSavingList(null);
    }
  }

  function updateLabel(key: keyof UiLabels, value: string) {
    setDraft((current) => ({ ...current, labels: { ...current.labels, [key]: value } }));
  }

  if (!session) return <main className="access-shell"><section className="access-card"><p className="heading-copy">Checking access...</p></section></main>;
  if (!session.configured || session.user?.role !== "admin") return <AccessGate configured={session.configured} />;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" />
        <span className="brand-divider" aria-hidden="true" />
        <span className="product-name">Field settings</span>
      </div>
      <div className="topbar-actions">
        <a className="secondary-action" href="/">Dashboard</a>
        <a className="secondary-action" href="/team">Team access</a>
        <form action="/api/auth/logout" method="post"><button className="secondary-action" type="submit">Sign out</button></form>
      </div>
    </header>
    <section className="settings-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin controls</p>
          <h1>Field settings</h1>
          <p className="heading-copy">Amend picklists and a few high-traffic labels here. Changes apply to new edits and dropdowns. Historical sales records keep the values already saved on them, so retire an option instead of deleting it.</p>
        </div>
      </div>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error ? <div className="notice is-error" role="alert">{error}</div> : null}

      <form className="settings-panel" onSubmit={saveLabels}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Display labels</p>
            <h2>Dashboard wording</h2>
            <p className="table-note">A small set of tab names, headings, and primary buttons. A fuller label library can follow later.</p>
          </div>
          <button className="primary-action" type="submit" disabled={savingList !== null}>{savingList === "labels" ? "Saving..." : "Save labels"}</button>
        </div>
        <div className="labels-grid">
          {UI_LABEL_KEYS.map((key) => (
            <label key={key}>
              {UI_LABEL_META[key].title}
              <input value={draft.labels[key]} onChange={(event) => updateLabel(key, event.target.value)} />
              <small>{UI_LABEL_META[key].hint}</small>
            </label>
          ))}
        </div>
      </form>

      {FIELD_LIST_KEYS.map((listKey) => {
        const options = draft.lists[listKey];
        const savedCount = settings.lists[listKey].length;
        return <section className="settings-panel" key={listKey}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Picklist</p>
              <h2>{FIELD_LIST_META[listKey].title}</h2>
              <p className="table-note">{FIELD_LIST_META[listKey].description} Stored values stay the same when you rename a label, so older records still match.</p>
            </div>
            <button className="primary-action" type="button" onClick={() => void saveList(listKey)} disabled={savingList !== null}>
              {savingList === listKey ? "Saving..." : "Save picklist"}
            </button>
          </div>
          <div className="settings-options">
            {options.map((option, index) => (
              <div className={option.isActive ? "settings-option" : "settings-option is-retired"} key={`${listKey}-${option.value}-${index}`}>
                <div className="settings-option-fields">
                  <label>
                    Display label
                    <input value={option.label} onChange={(event) => updateOption(listKey, index, { label: event.target.value })} />
                  </label>
                  <p className="stored-value">Stored value: {option.value}</p>
                </div>
                <div className="settings-option-actions">
                  <span className={`access-status ${option.isActive ? "access-active" : "access-revoked"}`}>{option.isActive ? "Active" : "Retired"}</span>
                  <button type="button" className="secondary-action compact-action" onClick={() => moveOption(listKey, index, -1)} disabled={index === 0}>Up</button>
                  <button type="button" className="secondary-action compact-action" onClick={() => moveOption(listKey, index, 1)} disabled={index === options.length - 1}>Down</button>
                  <button
                    type="button"
                    className={option.isActive ? "delete-button" : "secondary-action compact-action"}
                    onClick={() => updateOption(listKey, index, { isActive: !option.isActive })}
                  >
                    {option.isActive ? "Retire" : "Restore"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="add-option-row">
            <label>
              Add option
              <input
                value={newLabels[listKey]}
                onChange={(event) => setNewLabels((current) => ({ ...current, [listKey]: event.target.value }))}
                placeholder="New option label"
              />
            </label>
            <button type="button" className="secondary-action" onClick={() => addOption(listKey)} disabled={!newLabels[listKey].trim()}>Add to list</button>
          </div>
          <p className="table-note">{savedCount} saved option{savedCount === 1 ? "" : "s"}. Retired options stay available on historical records.</p>
        </section>;
      })}
    </section>
  </main>;
}
