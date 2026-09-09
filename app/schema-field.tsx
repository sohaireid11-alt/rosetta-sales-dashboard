"use client";

import { visibleOptions, type FieldDefinition, type FieldOption } from "./lib/field-settings-core";

export type SchemaFieldValue = string | string[];

type SchemaFieldProps = {
  field: FieldDefinition;
  value: SchemaFieldValue;
  options?: FieldOption[];
  extraOptions?: string[];
  required?: boolean;
  disabled?: boolean;
  optionalMark?: string;
  selectPlaceholder?: string;
  hiddenOptionSuffix?: string;
  emptyOptionsMessage?: string;
  onChange: (value: SchemaFieldValue) => void;
};

export function SchemaField({
  field,
  value,
  options,
  extraOptions = [],
  required,
  disabled,
  optionalMark = "Optional",
  selectPlaceholder = "Select",
  hiddenOptionSuffix = "(hidden from new lists)",
  emptyOptionsMessage = "No options yet. Add them under Dropdown options.",
  onChange,
}: SchemaFieldProps) {
  const isRequired = required ?? field.isRequired;
  const choices = extraOptions.length
    ? [
        ...visibleOptions(options, Array.isArray(value) ? value : value),
        ...extraOptions
          .filter((option) => !(options ?? []).some((item) => item.value === option))
          .map((option, index) => ({ id: -1 - index, value: option, label: option, sortOrder: 999, isActive: true })),
      ]
    : visibleOptions(options, Array.isArray(value) ? value : value);
  const textValue = Array.isArray(value) ? (value[0] ?? "") : value;
  const selected = Array.isArray(value) ? value : textValue ? [textValue] : [];
  const wide = field.inputType === "textarea" || field.inputType === "multiselect";

  function toggle(choice: string, checked: boolean) {
    const next = checked ? [...selected.filter((item) => item !== choice), choice] : selected.filter((item) => item !== choice);
    onChange(next);
  }

  return (
    <label className={wide ? "wide-field schema-field" : "schema-field"}>
      <span>
        {field.label}
        {isRequired ? null : <span className="optional"> {optionalMark}</span>}
      </span>
      {field.inputType === "textarea" ? (
        <textarea rows={3} required={isRequired} disabled={disabled} value={textValue} onChange={(event) => onChange(event.target.value)} placeholder={field.helpText} />
      ) : field.inputType === "multiselect" ? (
        <div className="multi-select" role="group" aria-label={field.label}>
          {choices.map((option) => (
            <label className="multi-select-option" key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={disabled}
                onChange={(event) => toggle(option.value, event.target.checked)}
              />
              <span>{option.label}{option.isActive ? "" : ` ${hiddenOptionSuffix}`}</span>
            </label>
          ))}
          {!choices.length ? <p className="table-note">{emptyOptionsMessage}</p> : null}
        </div>
      ) : field.inputType === "select" ? (
        <select required={isRequired} disabled={disabled} value={textValue} onChange={(event) => onChange(event.target.value)}>
          {!isRequired ? <option value="">{selectPlaceholder}</option> : null}
          {choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.inputType === "checkbox" ? (
        <span className="checkbox-field">
          <input type="checkbox" checked={textValue === "true"} disabled={disabled} onChange={(event) => onChange(event.target.checked ? "true" : "")} />
          <span>{field.helpText || field.label}</span>
        </span>
      ) : (
        <input
          required={isRequired}
          disabled={disabled}
          type={field.inputType === "number" ? "number" : field.inputType === "date" ? "date" : field.fieldKey === "contactEmail" ? "email" : "text"}
          inputMode={field.inputType === "number" ? "decimal" : undefined}
          min={field.inputType === "number" ? 0 : undefined}
          step={field.inputType === "number" ? "0.01" : undefined}
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.helpText}
        />
      )}
      {field.helpText && field.inputType !== "text" && field.inputType !== "textarea" && field.inputType !== "checkbox" ? <small className="field-help">{field.helpText}</small> : null}
    </label>
  );
}
