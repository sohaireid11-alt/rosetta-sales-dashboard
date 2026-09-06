"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AccessGate } from "../access-gate";
import {
  COMING_NEXT,
  DEFAULT_FIELD_SECTIONS,
  FIELD_INPUT_TYPES,
  FIELD_SECTION_KEYS,
  VIEW_KEYS,
  VIEW_META,
  type FieldDefinition,
  type FieldEntity,
  type FieldInputType,
  type ViewKey,
} from "../admin-catalog";
import {
  defaultFieldSettings,
  type FieldOption,
  type FieldSettings,
  type UiLabels,
} from "../lib/field-settings-core";
import {
  FIELD_LIST_KEYS,
  FIELD_LIST_META,
  UI_LABEL_GROUP_META,
  UI_LABEL_GROUPS,
  UI_LABEL_KEYS,
  UI_LABEL_META,
  type FieldListKey,
} from "../sales-config";

type AppRole = "admin" | "contributor";
type Session = {
  configured: boolean;
  user: { id: number; email: string; displayName: string; role: AppRole } | null;
};
type AdminTab = "fields" | "picklists" | "tables" | "copy" | "team" | "roadmap";

const ENTITY_TITLES: Record<FieldEntity, string> = {
  sales_record: "Sales records & contributor form",
  client_follow_up: "Client care",
  activity: "Activity notes",
};

const TYPE_LABELS: Record<FieldInputType, string> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  select: "Single dropdown",
  multiselect: "Multi-select",
  checkbox: "Checkbox",
};

function cloneSettings(settings: FieldSettings): FieldSettings {
  return {
    labels: { ...settings.labels },
    lists: Object.fromEntries(
      FIELD_LIST_KEYS.map((key) => [key, settings.lists[key].map((option) => ({ ...option }))])
    ) as FieldSettings["lists"],
    fields: settings.fields.map((field) => ({ ...field })),
    views: Object.fromEntries(
      VIEW_KEYS.map((key) => [key, (settings.views[key] ?? []).map((column) => ({ ...column }))])
    ) as FieldSettings["views"],
    sections: { ...settings.sections },
  };
}

function listFingerprint(options: FieldOption[]) {
  return options.map((option) => `${option.value}\u0000${option.label}\u0000${option.isActive ? "1" : "0"}`).join("\n");
}

function fieldFingerprint(field: FieldDefinition) {
  return [field.label, field.helpText, field.inputType, field.isRequired ? "1" : "0", field.isActive ? "1" : "0", field.sectionKey, String(field.sortOrder)].join("\u0000");
}

export default function FieldSettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<FieldSettings>(defaultFieldSettings);
  const [draft, setDraft] = useState<FieldSettings>(defaultFieldSettings);
  const [tab, setTab] = useState<AdminTab>("fields");
  const [newLabels, setNewLabels] = useState<Record<FieldListKey, string>>(
    Object.fromEntries(FIELD_LIST_KEYS.map((key) => [key, ""])) as Record<FieldListKey, string>
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const accessResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const access = await accessResponse.json() as Session;
    setSession(access);
    if (access.user?.role !== "admin") return;
    const settingsResponse = await fetch("/api/field-settings", { cache: "no-store" });
    const payload = await settingsResponse.json() as FieldSettings & { error?: string };
    if (!settingsResponse.ok) throw new Error(payload.error ?? "Unable to load admin settings.");
    const next = cloneSettings({ ...defaultFieldSettings(), ...payload, fields: payload.fields ?? defaultFieldSettings().fields, views: payload.views ?? defaultFieldSettings().views, sections: payload.sections ?? defaultFieldSettings().sections });
    setSettings(next);
    setDraft(cloneSettings(next));
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load admin settings."));
  }, []);

  function applySaved(payload: FieldSettings) {
    const next = cloneSettings({ ...defaultFieldSettings(), ...payload, fields: payload.fields ?? defaultFieldSettings().fields, views: payload.views ?? defaultFieldSettings().views, sections: payload.sections ?? defaultFieldSettings().sections });
    setSettings(next);
    setDraft(cloneSettings(next));
  }

  async function put(body: unknown, success: string) {
    const response = await fetch("/api/field-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as FieldSettings & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to save.");
    applySaved(payload);
    setNotice(success);
  }

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
    setSavingKey(listKey);
    setNotice("");
    setError("");
    try {
      await put({
        listKey,
        options: draft.lists[listKey].map((option) => ({
          value: option.value,
          label: option.label,
          isActive: option.isActive,
        })),
      }, `${FIELD_LIST_META[listKey].title} updated. Forms will now use these dropdown options.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this picklist.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveField(field: FieldDefinition) {
    setSavingKey(`${field.entity}:${field.fieldKey}`);
    setNotice("");
    setError("");
    try {
      await put({
        entity: field.entity,
        fieldKey: field.fieldKey,
        field: {
          entity: field.entity,
          fieldKey: field.fieldKey,
          label: field.label,
          helpText: field.helpText,
          inputType: field.inputType,
          isRequired: field.isRequired,
          isActive: field.isActive,
          sortOrder: field.sortOrder,
          sectionKey: field.sectionKey,
        },
      }, `${field.label} saved. The next time someone opens a form, they will see this setting.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this field.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveView(viewKey: ViewKey) {
    setSavingKey(viewKey);
    setNotice("");
    setError("");
    try {
      await put({
        viewKey,
        columns: draft.views[viewKey].map((column) => ({
          columnKey: column.columnKey,
          label: column.label,
          isVisible: column.isVisible,
        })),
      }, `${VIEW_META[viewKey].title} updated.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save table columns.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveLabels(event: FormEvent<HTMLFormElement>, group: string) {
    event.preventDefault();
    setSavingKey(group);
    setNotice("");
    setError("");
    try {
      await put({ labels: draft.labels }, group === "team" ? "Team access wording updated." : "Dashboard wording updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save wording.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveSections(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingKey("sections");
    setNotice("");
    setError("");
    try {
      await put({ sections: draft.sections }, "Form section titles updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save section titles.");
    } finally {
      setSavingKey(null);
    }
  }

  function patchField(entity: FieldEntity, fieldKey: string, patch: Partial<FieldDefinition>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (
        field.entity === entity && field.fieldKey === fieldKey ? { ...field, ...patch } : field
      )),
    }));
  }

  function moveField(entity: FieldEntity, fieldKey: string, direction: -1 | 1) {
    setDraft((current) => {
      const inEntity = current.fields
        .filter((field) => field.entity === entity)
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder);
      const index = inEntity.findIndex((field) => field.fieldKey === fieldKey);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= inEntity.length) return current;
      const reordered = [...inEntity];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, moved);
      const order = new Map(reordered.map((field, sortOrder) => [`${field.entity}:${field.fieldKey}`, sortOrder]));
      return {
        ...current,
        fields: current.fields.map((field) => (
          field.entity === entity ? { ...field, sortOrder: order.get(`${field.entity}:${field.fieldKey}`) ?? field.sortOrder } : field
        )),
      };
    });
  }

  const savedFields = useMemo(() => new Map(settings.fields.map((field) => [`${field.entity}:${field.fieldKey}`, field])), [settings.fields]);

  if (!session) return <main className="access-shell"><section className="access-card"><p className="heading-copy">Checking access...</p></section></main>;
  if (!session.configured || session.user?.role !== "admin") return <AccessGate configured={session.configured} />;

  const tabs: { id: AdminTab; label: string }[] = [
    { id: "fields", label: "Form fields" },
    { id: "picklists", label: "Dropdown options" },
    { id: "tables", label: "Tables" },
    { id: "copy", label: "Dashboard wording" },
    { id: "team", label: "Team wording" },
    { id: "roadmap", label: "Coming next" },
  ];

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" />
        <span className="brand-divider" aria-hidden="true" />
        <span className="product-name">Admin controls</span>
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
          <p className="eyebrow">Admin Control Center</p>
          <h1>Change the dashboard yourself</h1>
          <p className="heading-copy">Admins own labels, field types, required rules, visibility, and dropdown options. After you save, the next form or page load uses your settings — no coding or GitHub needed.</p>
        </div>
      </div>

      <section className="settings-panel handbook-panel">
        <p className="eyebrow">How to change anything</p>
        <ol className="handbook-list">
          <li><strong>Change a dropdown to multi-select:</strong> open Form fields, find the field (Service, Source type, or Action needed are common), set Input type to Multi-select, then Save field. Existing single values still load.</li>
          <li><strong>Add or remove choices:</strong> open Dropdown options, type a new choice, press Enter or Add option, then Save picklist. Remove from dropdowns hides a choice without deleting history.</li>
          <li><strong>Rename a label or button:</strong> open Dashboard wording or Team wording, edit the text, and save that group.</li>
          <li><strong>Hide a field or table column:</strong> turn Show on forms off (Form fields) or uncheck a column (Tables), then save.</li>
        </ol>
      </section>

      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error ? <div className="notice is-error" role="alert">{error}</div> : null}

      <nav className="admin-tabs" aria-label="Admin control sections">
        {tabs.map((item) => (
          <button type="button" key={item.id} className={tab === item.id ? "tab is-active" : "tab"} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>

      {tab === "fields" ? <>
        <form className="settings-panel" onSubmit={saveSections}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Form sections</p>
              <h2>Section titles</h2>
              <p className="table-note">These headings group fields on the sales record, contributor, and client-care forms.</p>
            </div>
            <button className="primary-action" type="submit" disabled={savingKey !== null}>{savingKey === "sections" ? "Saving..." : "Save section titles"}</button>
          </div>
          <div className="labels-grid">
            {FIELD_SECTION_KEYS.map((key) => (
              <label key={key}>
                {DEFAULT_FIELD_SECTIONS[key].title}
                <input value={draft.sections[key]} onChange={(event) => setDraft((current) => ({ ...current, sections: { ...current.sections, [key]: event.target.value } }))} />
              </label>
            ))}
          </div>
        </form>
        {(["sales_record", "client_follow_up", "activity"] as FieldEntity[]).map((entity) => {
          const fields = draft.fields.filter((field) => field.entity === entity).slice().sort((left, right) => left.sortOrder - right.sortOrder);
          return <section className="settings-panel" key={entity}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Form fields</p>
                <h2>{ENTITY_TITLES[entity]}</h2>
                <p className="table-note">Edit the label, help text, input type, required flag, and whether the field appears. Changing Single dropdown to Multi-select stores extra values in the same column as JSON when there is more than one choice. Older single values still open and save.</p>
              </div>
            </div>
            <div className="field-editor-list">
              {fields.map((field, index) => {
                const saved = savedFields.get(`${field.entity}:${field.fieldKey}`);
                const unsaved = !saved || fieldFingerprint(field) !== fieldFingerprint(saved);
                const typeOptions = field.typeLocked ? [field.inputType] : field.listKey ? FIELD_INPUT_TYPES : FIELD_INPUT_TYPES.filter((type) => type !== "select" && type !== "multiselect");
                return <article className={field.isActive ? "field-editor" : "field-editor is-hidden"} key={`${field.entity}-${field.fieldKey}`}>
                  <div className="field-editor-grid">
                    <label>Label<input value={field.label} onChange={(event) => patchField(field.entity, field.fieldKey, { label: event.target.value })} /></label>
                    <label>Input type
                      <select value={field.inputType} disabled={field.typeLocked} onChange={(event) => patchField(field.entity, field.fieldKey, { inputType: event.target.value as FieldInputType })}>
                        {typeOptions.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                      </select>
                    </label>
                    <label>Section
                      <select value={field.sectionKey} onChange={(event) => patchField(field.entity, field.fieldKey, { sectionKey: event.target.value as FieldDefinition["sectionKey"] })}>
                        {FIELD_SECTION_KEYS.filter((key) => DEFAULT_FIELD_SECTIONS[key].entity === field.entity).map((key) => (
                          <option key={key} value={key}>{draft.sections[key]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="wide-field">Help text<input value={field.helpText} onChange={(event) => patchField(field.entity, field.fieldKey, { helpText: event.target.value })} placeholder="Shown under the field or as placeholder" /></label>
                  </div>
                  <div className="field-editor-flags">
                    <label className="flag-toggle"><input type="checkbox" checked={field.isRequired} onChange={(event) => patchField(field.entity, field.fieldKey, { isRequired: event.target.checked })} /> Required</label>
                    <label className="flag-toggle"><input type="checkbox" checked={field.isActive} onChange={(event) => patchField(field.entity, field.fieldKey, { isActive: event.target.checked })} /> Show on forms</label>
                    {field.listKey ? <a className="text-action" href="#picklists" onClick={(event) => { event.preventDefault(); setTab("picklists"); }}>{FIELD_LIST_META[field.listKey].title} options</a> : null}
                    {field.typeLocked ? <span className="table-note">Type is locked so pipeline rules keep working.</span> : null}
                    <div className="field-editor-actions">
                      <button type="button" className="secondary-action compact-action" onClick={() => moveField(field.entity, field.fieldKey, -1)} disabled={index === 0}>Up</button>
                      <button type="button" className="secondary-action compact-action" onClick={() => moveField(field.entity, field.fieldKey, 1)} disabled={index === fields.length - 1}>Down</button>
                      <button type="button" className={unsaved ? "primary-action compact-action" : "secondary-action compact-action"} onClick={() => void saveField(field)} disabled={savingKey !== null}>
                        {savingKey === `${field.entity}:${field.fieldKey}` ? "Saving..." : unsaved ? "Save field" : "Saved"}
                      </button>
                    </div>
                  </div>
                </article>;
              })}
            </div>
          </section>;
        })}
      </> : null}

      {tab === "picklists" ? <>
        <nav className="picklist-nav" aria-label="Dropdown lists">
          {FIELD_LIST_KEYS.map((listKey) => (
            <a className="picklist-nav-link" href={`#picklist-${listKey}`} key={listKey}>{FIELD_LIST_META[listKey].title}</a>
          ))}
        </nav>
        {FIELD_LIST_KEYS.map((listKey) => {
          const options = draft.lists[listKey];
          const activeCount = options.filter((option) => option.isActive).length;
          const hiddenCount = options.length - activeCount;
          const unsaved = listFingerprint(options) !== listFingerprint(settings.lists[listKey] ?? []);
          return <section className="settings-panel" id={`picklist-${listKey}`} key={listKey}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Dropdown list</p>
                <h2>{FIELD_LIST_META[listKey].title}</h2>
                <p className="table-note">{FIELD_LIST_META[listKey].description} Removing an option hides it from new dropdowns. Historical records keep the stored value, so it is not permanently deleted.</p>
              </div>
              <button className={unsaved ? "primary-action" : "secondary-action"} type="button" onClick={() => void saveList(listKey)} disabled={savingKey !== null}>
                {savingKey === listKey ? "Saving..." : unsaved ? "Save picklist" : "Saved"}
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
              <button type="submit" className="primary-action add-option-button" disabled={!newLabels[listKey].trim() || savingKey !== null}>Add option</button>
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
                      <button type="button" className="delete-button" onClick={() => removeOption(listKey, index)}>
                        {unsavedOption ? "Remove" : "Remove from dropdowns"}
                      </button>
                    ) : (
                      <button type="button" className="secondary-action compact-action" onClick={() => updateOption(listKey, index, { isActive: true })}>
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
      </> : null}

      {tab === "tables" ? VIEW_KEYS.map((viewKey) => {
        const columns = draft.views[viewKey] ?? [];
        const saved = settings.views[viewKey] ?? [];
        const unsaved = columns.map((column) => `${column.columnKey}:${column.label}:${column.isVisible ? 1 : 0}`).join("|")
          !== saved.map((column) => `${column.columnKey}:${column.label}:${column.isVisible ? 1 : 0}`).join("|");
        return <section className="settings-panel" key={viewKey}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Table columns</p>
              <h2>{VIEW_META[viewKey].title}</h2>
              <p className="table-note">{VIEW_META[viewKey].description}</p>
            </div>
            <button className={unsaved ? "primary-action" : "secondary-action"} type="button" onClick={() => void saveView(viewKey)} disabled={savingKey !== null}>
              {savingKey === viewKey ? "Saving..." : unsaved ? "Save columns" : "Saved"}
            </button>
          </div>
          <div className="settings-options">
            {columns.map((column, index) => (
              <div className="settings-option" key={column.columnKey}>
                <div className="settings-option-fields">
                  <label>Column heading<input value={column.label} onChange={(event) => setDraft((current) => ({
                    ...current,
                    views: {
                      ...current.views,
                      [viewKey]: current.views[viewKey].map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item),
                    },
                  }))} /></label>
                  <p className="stored-value">Column key: {column.columnKey}{column.isLocked ? " · Always visible" : ""}</p>
                </div>
                <label className="flag-toggle">
                  <input type="checkbox" checked={column.isVisible} disabled={column.isLocked} onChange={(event) => setDraft((current) => ({
                    ...current,
                    views: {
                      ...current.views,
                      [viewKey]: current.views[viewKey].map((item, itemIndex) => itemIndex === index ? { ...item, isVisible: event.target.checked } : item),
                    },
                  }))} />
                  Show column
                </label>
              </div>
            ))}
          </div>
        </section>;
      }) : null}

      {tab === "copy" ? <form className="settings-panel labels-panel" onSubmit={(event) => void saveLabels(event, "copy")}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Dashboard wording</p>
            <h2>Tabs, metrics, empty states, and buttons</h2>
            <p className="table-note">These strings appear on Overview, Sales records, Client care, and shared chrome. Field labels are under Form fields. Dropdown choices are under Dropdown options.</p>
          </div>
          <button className="primary-action" type="submit" disabled={savingKey !== null}>{savingKey === "copy" ? "Saving..." : "Save dashboard wording"}</button>
        </div>
        {UI_LABEL_GROUPS.filter((group) => group !== "team").map((group) => (
          <div className="copy-group" key={group}>
            <h3>{UI_LABEL_GROUP_META[group].title}</h3>
            <p className="table-note">{UI_LABEL_GROUP_META[group].description}</p>
            <div className="labels-grid">
              {UI_LABEL_KEYS.filter((key) => UI_LABEL_META[key].group === group).map((key) => (
                <label key={key}>
                  {UI_LABEL_META[key].title}
                  <input value={draft.labels[key]} onChange={(event) => setDraft((current) => ({ ...current, labels: { ...current.labels, [key]: event.target.value } }))} />
                  <small>{UI_LABEL_META[key].hint}</small>
                </label>
              ))}
            </div>
          </div>
        ))}
      </form> : null}

      {tab === "team" ? <form className="settings-panel labels-panel" onSubmit={(event) => void saveLabels(event, "team")}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Team access</p>
            <h2>Team page wording</h2>
            <p className="table-note">Headings, form labels, and buttons on Team access. Who can sign in is still managed on that page — this tab only changes the words.</p>
          </div>
          <button className="primary-action" type="submit" disabled={savingKey !== null}>{savingKey === "team" ? "Saving..." : "Save team wording"}</button>
        </div>
        <div className="labels-grid">
          {UI_LABEL_KEYS.filter((key) => UI_LABEL_META[key].group === "team").map((key) => (
            <label key={key}>
              {UI_LABEL_META[key].title}
              <input value={draft.labels[key]} onChange={(event) => setDraft((current) => ({ ...current, labels: { ...current.labels, [key]: event.target.value } }))} />
              <small>{UI_LABEL_META[key].hint}</small>
            </label>
          ))}
        </div>
      </form> : null}

      {tab === "roadmap" ? <section className="settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Coming next</p>
            <h2>Not in this release — listed so nothing is silent</h2>
            <p className="table-note">Everything else on the dashboard that admins typically change is already here: field types, options, labels, table columns, and page copy.</p>
          </div>
        </div>
        <div className="roadmap-list">
          {COMING_NEXT.map((item) => (
            <article className="roadmap-item" key={item.title}>
              <h3>{item.title}</h3>
              <p className="table-note">{item.detail}</p>
            </article>
          ))}
        </div>
      </section> : null}
    </section>
  </main>;
}

export type { UiLabels };
