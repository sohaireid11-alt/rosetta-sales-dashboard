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

function listFingerprint(options: FieldOption[]) {
  return options.map((option) => `${option.value}\u0000${option.label}\u0000${option.isActive ? "1" : "0"}`).join("\n");
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
    const duplicate = draft.lists[listKey].some((option) => (
      option.label.toLocaleLowerCase() === label.toLocaleLowerCase()
      || option.value.toLocaleLowerCase() === label.toLocaleLowerCase()
    ));
    if (duplicate) {
      setError(`"${label}" is already on ${FIELD_LIST_META[listKey].title}.`);
      return;
    }
    setError("");
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

  function removeOption(listKey: FieldListKey, index: number) {
    setDraft((current) => {
      const option = current.lists[listKey][index];
      if (!option) return current;
      if (option.id === 0) {
        const options = current.lists[listKey]
          .filter((_, optionIndex) => optionIndex !== index)
          .map((next, sortOrder) => ({ ...next, sortOrder }));
        return { ...current, lists: { ...current.lists, [listKey]: options } };
      }
      const options = current.lists[listKey].map((next, optionIndex) => (
        optionIndex === index ? { ...next, isActive: false } : next
      ));
      return { ...current, lists: { ...current.lists, [listKey]: options } };
    });
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
      setNotice(`${FIELD_LIST_META[listKey].title} updated. Dashboard forms will now use these dropdown options.`);
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
          <h1>Dropdown options</h1>
          <p className="heading-copy">Add, remove, rename, and reorder the choices that appear in dashboard dropdowns — services, statuses, sources, actions, and the other form lists. Changes apply the next time someone opens a form. Existing sales records keep the values already saved on them.</p>
        </div>
      </div>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error ? <div className="notice is-error" role="alert">{error}</div> : null}

      <nav className="picklist-nav" aria-label="Dropdown lists">
        {FIELD_LIST_KEYS.map((listKey) => (
          <a className="picklist-nav-link" href={`#picklist-${listKey}`} key={listKey}>{FIELD_LIST_META[listKey].title}</a>
        ))}
        <a className="picklist-nav-link is-secondary" href="#display-labels">Display labels</a>
      </nav>

      {FIELD_LIST_KEYS.map((listKey) => {
        const options = draft.lists[listKey];
        const activeCount = options.filter((option) => option.isActive).length;
        const hiddenCount = options.length - activeCount;
        const unsaved = listFingerprint(options) !== listFingerprint(settings.lists[listKey]);
        return <section className="settings-panel" id={`picklist-${listKey}`} key={listKey}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Dropdown list</p>
              <h2>{FIELD_LIST_META[listKey].title}</h2>
              <p className="table-note">{FIELD_LIST_META[listKey].description} Removing an option hides it from new dropdowns. Historical records keep the stored value, so it is not permanently deleted.</p>
            </div>
            <button className={unsaved ? "primary-action" : "secondary-action"} type="button" onClick={() => void saveList(listKey)} disabled={savingList !== null}>
              {savingList === listKey ? "Saving..." : unsaved ? "Save picklist" : "Saved"}
            </button>
          </div>
          <form
            className="add-option-card"
            onSubmit={(event) => {
              event.preventDefault();
              addOption(listKey);
            }}
          >
            <label>
              Add a dropdown option
              <input
                value={newLabels[listKey]}
                onChange={(event) => setNewLabels((current) => ({ ...current, [listKey]: event.target.value }))}
                placeholder="Type a new choice, then press Enter"
              />
            </label>
            <button type="submit" className="primary-action add-option-button" disabled={!newLabels[listKey].trim() || savingList !== null}>Add option</button>
          </form>
          {options.length ? <div className="settings-options">
            {options.map((option, index) => {
              const unsavedOption = option.id === 0;
              return <div className={option.isActive ? "settings-option" : "settings-option is-hidden"} key={`${listKey}-${option.value}-${index}`}>
                <div className="settings-option-fields">
                  <label>
                    Option name
                    <input value={option.label} onChange={(event) => updateOption(listKey, index, { label: event.target.value })} />
                  </label>
                  <p className="stored-value">Stored value: {option.value}{unsavedOption ? " · Not saved yet" : ""}</p>
                </div>
                <div className="settings-option-actions">
                  <span className={`access-status ${option.isActive ? "access-active" : "access-revoked"}`}>
                    {option.isActive ? "In dropdowns" : "Hidden from dropdowns"}
                  </span>
                  <button type="button" className="secondary-action compact-action" onClick={() => moveOption(listKey, index, -1)} disabled={index === 0}>Up</button>
                  <button type="button" className="secondary-action compact-action" onClick={() => moveOption(listKey, index, 1)} disabled={index === options.length - 1}>Down</button>
                  {option.isActive ? (
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => removeOption(listKey, index)}
                    >
                      {unsavedOption ? "Remove" : "Remove from dropdowns"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      onClick={() => updateOption(listKey, index, { isActive: true })}
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>;
            })}
          </div> : <p className="picklist-empty">No options yet. Type a choice above and click Add option, then save this picklist.</p>}
          <p className="table-note">
            {activeCount} in dropdowns{hiddenCount ? ` · ${hiddenCount} hidden from dropdowns` : ""}.
            {unsaved ? " You have unsaved changes on this list." : ""}
            {" "}Hidden options stay valid on older records. Restore puts them back in the menus. Permanent delete is not used, so history never breaks.
          </p>
        </section>;
      })}

      <form className="settings-panel labels-panel" id="display-labels" onSubmit={saveLabels}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Display labels</p>
            <h2>Dashboard wording</h2>
            <p className="table-note">These are tab names, headings, and buttons — not dropdown menu options. Use the lists above to add or remove form choices.</p>
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
    </section>
  </main>;
}
