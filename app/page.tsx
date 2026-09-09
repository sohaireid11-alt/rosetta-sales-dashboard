"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessGate } from "./access-gate";
import { SettingsMenu } from "./settings-menu";
import {
  applySalesFieldChange,
  careFields,
  columnLabel,
  columnVisible,
  emptySalesValues,
  payloadFromSalesValues,
  recordToSalesValues,
  salesFieldRequired,
  salesFields,
  sectionTitle,
  showSalesField,
  type FormValue,
  type SalesFormValues,
} from "./lib/form-runtime";
import {
  defaultFieldSettings,
  firstActiveValue,
  labelFor,
  type FieldSettings,
} from "./lib/field-settings-core";
import { displayChoices, includesChoice, parseStoredValues } from "./lib/field-values";
import { SchemaField } from "./schema-field";
import {
  CARE_ATTENTION_STATUSES,
  CLOSED_STAGES,
  PENDING_STAGE,
  SCHEDULED_INTERPRETATION_SERVICE,
  WON_STAGE,
} from "./sales-config";

type Stage = string;
type SalesRecord = {
  id: number;
  leadName: string;
  company: string;
  organizationType: string;
  sourceType: string;
  referredBy: string;
  requestReceivedBy: string;
  service: string;
  serviceDelivery: string;
  interpretationMode: string;
  opportunityType: string;
  stage: Stage;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  meetingStage: string;
  nextMeetingAt: string | null;
  nextFollowUpAt: string | null;
  nextAction: string;
  estimatedRevenueCents: number;
  bookedRevenueCents: number;
  createdAt: string;
  closedAt: string | null;
};
type SalesActivity = { id: number; salesRecordId: number; activityType: string; content: string; createdAt: string };
type TeamMember = { id: number; name: string; email: string; role: string };
type ClientFollowUp = {
  id: number;
  salesRecordId: number | null;
  clientName: string;
  relationshipType: string;
  lastEngagementAt: string | null;
  lastCheckInAt: string | null;
  satisfactionStatus: string;
  nextFollowUpAt: string | null;
  nextAction: string;
  expansionOpportunity: string;
  createdAt: string;
  updatedAt: string;
  linkedLeadName: string | null;
};
type RecordForm = SalesFormValues;
type ClientFollowUpForm = {
  salesRecordId: string;
  clientName: string;
  relationshipType: FormValue;
  lastEngagementAt: string;
  lastCheckInAt: string;
  satisfactionStatus: FormValue;
  nextFollowUpAt: string;
  nextAction: FormValue;
  expansionOpportunity: string;
};
type RecordFilter = "all" | "overdue" | "today" | "next7" | "none";
type TimeFilter = "all" | "last90" | "quarter";
const ALL_OWNERS = "__all__";
type AccessSession = {
  configured: boolean;
  legacy?: boolean;
  user: { id: number; email: string; displayName: string; role: "admin" | "contributor" } | null;
};

const chartColors = ["#173f78", "#c87daf", "#16856f", "#d6a743", "#4a89a6", "#a46a39", "#7683a4"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyRecordForm(settings: FieldSettings = defaultFieldSettings()): RecordForm {
  return emptySalesValues(settings, { createdAt: today(), requestReceivedBy: "Admin" });
}

function emptyClientFollowUpForm(settings: FieldSettings = defaultFieldSettings()): ClientFollowUpForm {
  const relationship = careFields(settings).find((field) => field.fieldKey === "relationshipType");
  const satisfaction = careFields(settings).find((field) => field.fieldKey === "satisfactionStatus");
  const nextAction = careFields(settings).find((field) => field.fieldKey === "nextAction");
  return {
    salesRecordId: "",
    clientName: "",
    relationshipType: relationship?.inputType === "multiselect" ? [] : firstActiveValue(settings.lists.relationshipTypes, "Recurring client"),
    lastEngagementAt: "",
    lastCheckInAt: "",
    satisfactionStatus: satisfaction?.inputType === "multiselect" ? [] : firstActiveValue(settings.lists.satisfactionStatuses, "Healthy"),
    nextFollowUpAt: "",
    nextAction: nextAction?.inputType === "multiselect" ? [] : "",
    expansionOpportunity: "",
  };
}

function choiceLabel(options: FieldSettings["lists"][keyof FieldSettings["lists"]], raw: unknown, empty = "") {
  return displayChoices(raw, (value) => labelFor(options, value), empty);
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function shortMoney(cents: number) {
  const value = cents / 100;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `$${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return money(cents);
}

function dateLabel(value: string | null, empty = "Not scheduled") {
  if (!value) return empty;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function stageClass(stage: Stage) {
  return `stage stage-${stage.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function pickLegacy(value: string, options: string[], fallback: string) {
  return options.includes(value) ? value : (options.includes(fallback) ? fallback : options[0] ?? fallback);
}

function legacySource(value: string, sourceTypes: string[]) {
  if (value === "Referral" || value === "Repeat client") return pickLegacy("External client referral", sourceTypes, "Other");
  return pickLegacy(value, sourceTypes, "Other");
}

function legacyService(value: string, services: string[]) {
  if (value === "Translation" || value === "Localization") return pickLegacy("Translation and Proofreading of Documents", services, "Other service");
  if (value === "Interpretation") return pickLegacy(SCHEDULED_INTERPRETATION_SERVICE, services, "Other service");
  if (value === "Training" || value === "Other") return pickLegacy("Other service", services, "Other service");
  return pickLegacy(value, services, "Other service");
}

function legacyStatus(value: string, statuses: string[]) {
  if (value === "Qualified" || value === "Proposal") return pickLegacy(PENDING_STAGE, statuses, "New");
  return pickLegacy(value, statuses, "New");
}

function csvRecords(content: string, settings: FieldSettings = defaultFieldSettings()): RecordForm[] {
  const rows = parseCsv(content);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one sales record.");
  const headers = rows[0].map(normalizeHeader);
  const column = (aliases: string[], label: string, required = true) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    if (required && index === -1) throw new Error(`The CSV is missing the ${label} column.`);
    return index;
  };
  const indexes = {
    leadName: column(["leadname", "lead", "clientname"], "Lead name"),
    company: column(["company", "organization", "organisation"], "Company", false),
    organizationType: column(["organizationtype", "organisationtype", "orgtype"], "Organization type", false),
    sourceType: column(["sourcetype", "leadsource", "source"], "Source type"),
    referredBy: column(["referredby", "referrer"], "Referred by", false),
    requestReceivedBy: column(["requestreceivedby", "recordowner", "owner", "salesowner"], "Request received by", false),
    service: column(["service", "serviceline"], "Service"),
    serviceDelivery: column(["servicedelivery", "delivery", "deliverytype"], "Service delivery", false),
    interpretationMode: column(["interpretationmode", "mode"], "Interpretation mode", false),
    opportunityType: column(["opportunitytype", "clienttype"], "Opportunity type", false),
    stage: column(["stage", "status"], "Status"),
    contactName: column(["contactname", "contactperson"], "Contact name", false),
    contactTitle: column(["contacttitle", "contactrole"], "Contact title", false),
    contactEmail: column(["contactemail", "email"], "Contact email", false),
    contactPhone: column(["contactphone", "phone"], "Contact phone", false),
    meetingStage: column(["meetingstage"], "Meeting stage", false),
    nextMeetingAt: column(["nextmeetingdate", "nextmeetingat"], "Next meeting date", false),
    nextFollowUpAt: column(["dateofnextfollowup", "nextfollowupdate", "nextfollowupat"], "Date of next follow-up", false),
    nextAction: column(["actionneeded", "nextaction"], "Action needed", false),
    dealValue: column(["dealvalueusd", "dealvalue", "value", "revenue", "estimatedrevenue"], "Deal value"),
    createdAt: column(["leaddate", "createdat", "createddate", "date"], "Lead date"),
    closedAt: column(["closedate", "closedat"], "Close date", false),
    notes: column(["notes", "note", "comments"], "Notes", false),
  };
  const cell = (row: string[], index: number) => index >= 0 ? (row[index] ?? "").trim() : "";
  const lists = settings.lists;
  const statusValues = lists.statuses.map((option) => option.value);
  const sourceValues = lists.sourceTypes.map((option) => option.value);
  const serviceValues = lists.services.map((option) => option.value);
  return rows.slice(1).map((row) => {
    const imported = emptyRecordForm(settings);
    const serviceCell = cell(row, indexes.service);
    const serviceValuesInRow = parseStoredValues(serviceCell);
    const service = serviceValuesInRow.length > 1 ? serviceValuesInRow : legacyService(serviceCell, serviceValues);
    return {
      ...imported,
      leadName: cell(row, indexes.leadName), company: cell(row, indexes.company),
      organizationType: cell(row, indexes.organizationType) || imported.organizationType, sourceType: parseStoredValues(cell(row, indexes.sourceType)).length > 1 ? parseStoredValues(cell(row, indexes.sourceType)) : legacySource(cell(row, indexes.sourceType), sourceValues),
      referredBy: cell(row, indexes.referredBy), requestReceivedBy: cell(row, indexes.requestReceivedBy) || "Admin", service,
      serviceDelivery: cell(row, indexes.serviceDelivery) || (includesChoice(service, SCHEDULED_INTERPRETATION_SERVICE) ? firstActiveValue(lists.interpretationDeliveries, "In-person") : ""),
      interpretationMode: cell(row, indexes.interpretationMode) || (includesChoice(service, SCHEDULED_INTERPRETATION_SERVICE) ? firstActiveValue(lists.interpretationModes, "Consecutive") : ""),
      opportunityType: cell(row, indexes.opportunityType) || imported.opportunityType, stage: legacyStatus(cell(row, indexes.stage), statusValues),
      contactName: cell(row, indexes.contactName), contactTitle: cell(row, indexes.contactTitle), contactEmail: cell(row, indexes.contactEmail), contactPhone: cell(row, indexes.contactPhone),
      meetingStage: cell(row, indexes.meetingStage) || imported.meetingStage, nextMeetingAt: cell(row, indexes.nextMeetingAt), nextFollowUpAt: cell(row, indexes.nextFollowUpAt),
      nextAction: parseStoredValues(cell(row, indexes.nextAction)).length > 1 ? parseStoredValues(cell(row, indexes.nextAction)) : cell(row, indexes.nextAction), dealValue: cell(row, indexes.dealValue), createdAt: cell(row, indexes.createdAt), closedAt: cell(row, indexes.closedAt),
      initialNote: cell(row, indexes.notes),
    };
  });
}

function followUpState(value: string | null) {
  if (!value) return "none";
  const todayValue = today();
  if (value < todayValue) return "overdue";
  if (value === todayValue) return "today";
  const target = new Date(`${value}T12:00:00`).getTime();
  const now = new Date(`${todayValue}T12:00:00`).getTime();
  return target - now <= 7 * 86_400_000 ? "next7" : "later";
}

function followUpLabel(record: SalesRecord, labels: FieldSettings["labels"]) {
  const state = followUpState(record.nextFollowUpAt);
  if (state === "overdue") return labels.followUpOverdue;
  if (state === "today") return labels.followUpDueToday;
  if (state === "next7") return labels.followUpNext7;
  if (state === "none") return labels.followUpNoDate;
  return labels.followUpScheduled;
}

export default function Home() {
  const [access, setAccess] = useState<AccessSession | null>(null);
  const [fieldSettings, setFieldSettings] = useState<FieldSettings>(defaultFieldSettings);
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clientFollowUps, setClientFollowUps] = useState<ClientFollowUp[]>([]);
  const [activeView, setActiveView] = useState<"overview" | "records" | "client-care">("overview");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("all");
  const [recordSearch, setRecordSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState(ALL_OWNERS);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SalesRecord | null>(null);
  const [form, setForm] = useState<RecordForm>(emptyRecordForm);
  const [mergeRecord, setMergeRecord] = useState<SalesRecord | null>(null);
  const [duplicateRecordId, setDuplicateRecordId] = useState("");
  const [activityRecord, setActivityRecord] = useState<SalesRecord | null>(null);
  const [activities, setActivities] = useState<SalesActivity[]>([]);
  const [activityType, setActivityType] = useState("Note");
  const [activityText, setActivityText] = useState("");
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [editingClientFollowUp, setEditingClientFollowUp] = useState<ClientFollowUp | null>(null);
  const [clientForm, setClientForm] = useState<ClientFollowUpForm>(emptyClientFollowUpForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [accessError, setAccessError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  async function loadAccess() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setAccessError("");
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unable to verify access.");
      setAccess((await response.json()) as AccessSession);
    } catch {
      setAccessError("We could not reach the sign-in service. Please try again.");
    } finally { window.clearTimeout(timeout); }
  }

  async function loadWorkspace() {
    setIsLoading(true); setError("");
    try {
      const [recordsResponse, teamResponse, clientResponse, settingsResponse] = await Promise.all([
        fetch("/api/deals", { cache: "no-store" }), fetch("/api/team-members", { cache: "no-store" }), fetch("/api/client-follow-ups", { cache: "no-store" }), fetch("/api/field-settings", { cache: "no-store" }),
      ]);
      const recordsPayload = await recordsResponse.json() as { records?: SalesRecord[]; error?: string };
      const teamPayload = await teamResponse.json() as { members?: TeamMember[] };
      const clientPayload = await clientResponse.json() as { followUps?: ClientFollowUp[]; error?: string };
      const settingsPayload = await settingsResponse.json() as FieldSettings & { error?: string };
      if (!recordsResponse.ok) throw new Error(recordsPayload.error ?? "Unable to load sales records.");
      if (!clientResponse.ok) throw new Error(clientPayload.error ?? "Unable to load client-care records.");
      setRecords(recordsPayload.records ?? []);
      setTeamMembers(teamPayload.members ?? []);
      setClientFollowUps(clientPayload.followUps ?? []);
      if (settingsResponse.ok) setFieldSettings(settingsPayload);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load the workspace."); }
    finally { setIsLoading(false); }
  }

  async function loadActivities(record: SalesRecord) {
    setActivityRecord(record); setActivities([]); setActivityText(""); setActivityType(firstActiveValue(fieldSettings.lists.activityTypes, "Note")); setError("");
    try {
      const response = await fetch(`/api/deals/${record.id}/activities`, { cache: "no-store" });
      const payload = await response.json() as { activities?: SalesActivity[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load activity history.");
      setActivities(payload.activities ?? []);
    } catch (activityError) { setError(activityError instanceof Error ? activityError.message : "Unable to load activity history."); }
  }

  useEffect(() => { void loadAccess(); }, []);
  useEffect(() => { if (access?.user) void loadWorkspace(); }, [access?.user?.role]);

  const requestReceivedOptions = useMemo(
    () => Array.from(new Set(["Admin", ...teamMembers.map((member) => member.name)])),
    [teamMembers]
  );
  const owners = useMemo(() => Array.from(new Set(records.map((record) => record.requestReceivedBy))).sort(), [records]);
  const visibleRecords = useMemo(() => {
    const now = new Date(); const cutoff = new Date(now);
    const searchQuery = recordSearch.trim().toLocaleLowerCase();
    const phoneQuery = searchQuery.replace(/\D/g, "");
    if (timeFilter === "last90") cutoff.setDate(now.getDate() - 90);
    if (timeFilter === "quarter") cutoff.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
    return records.filter((record) => {
      const state = followUpState(record.nextFollowUpAt);
      const recordMatches = recordFilter === "all" || (recordFilter === "today" && state === "today") || (recordFilter === "overdue" && state === "overdue") || (recordFilter === "next7" && state === "next7") || (recordFilter === "none" && state === "none");
      const nameMatches = !searchQuery || [record.leadName, record.contactName, record.company].some((value) => value.toLocaleLowerCase().includes(searchQuery));
      const phoneMatches = phoneQuery.length > 0 && record.contactPhone.replace(/\D/g, "").includes(phoneQuery);
      const searchMatches = activeView !== "records" || nameMatches || phoneMatches;
      return recordMatches && searchMatches && (ownerFilter === ALL_OWNERS || record.requestReceivedBy === ownerFilter) && (timeFilter === "all" || new Date(`${record.createdAt}T12:00:00`) >= cutoff);
    });
  }, [activeView, ownerFilter, recordFilter, recordSearch, records, timeFilter]);

  const performance = useMemo(() => {
    const closedStages = CLOSED_STAGES as readonly string[];
    const won = visibleRecords.filter((record) => includesChoice(record.stage, WON_STAGE));
    const active = visibleRecords.filter((record) => !parseStoredValues(record.stage).some((stage) => closedStages.includes(stage)));
    const closed = visibleRecords.filter((record) => parseStoredValues(record.stage).some((stage) => closedStages.includes(stage)));
    const bookedRevenue = won.reduce((total, record) => total + record.bookedRevenueCents, 0);
    const pipelineRevenue = active.reduce((total, record) => total + record.estimatedRevenueCents, 0);
    const grouped = new Map<string, { leads: number; won: number; pipeline: number; revenue: number }>();
    visibleRecords.forEach((record) => {
      const serviceKey = parseStoredValues(record.service).join(" · ") || record.service;
      const row = grouped.get(serviceKey) ?? { leads: 0, won: 0, pipeline: 0, revenue: 0 };
      row.leads += 1;
      if (includesChoice(record.stage, WON_STAGE)) { row.won += 1; row.revenue += record.bookedRevenueCents; }
      if (!parseStoredValues(record.stage).some((stage) => closedStages.includes(stage))) row.pipeline += record.estimatedRevenueCents;
      grouped.set(serviceKey, row);
    });
    const serviceRows = Array.from(grouped.entries()).map(([service, values]) => ({ service, ...values, winRate: values.leads ? Math.round((values.won / values.leads) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue || b.pipeline - a.pipeline);
    return { bookedRevenue, pipelineRevenue, conversion: closed.length ? Math.round((won.length / closed.length) * 100) : 0, won, active, serviceRows };
  }, [visibleRecords]);
  const careNeedingAttention = useMemo(() => clientFollowUps.filter((item) => (CARE_ATTENTION_STATUSES as readonly string[]).includes(item.satisfactionStatus)).length, [clientFollowUps]);
  const followUpQueue = useMemo(() => records.filter((record) => ["overdue", "today", "next7"].includes(followUpState(record.nextFollowUpAt))).sort((a, b) => (a.nextFollowUpAt ?? "9999").localeCompare(b.nextFollowUpAt ?? "9999")), [records]);
  const donutStyle = useMemo(() => {
    const total = performance.serviceRows.reduce((sum, row) => sum + row.revenue, 0);
    if (!total) return { background: "#e4e8f0" };
    let marker = 0;
    const stops = performance.serviceRows.map((row, index) => { const next = marker + (row.revenue / total) * 100; const stop = `${chartColors[index % chartColors.length]} ${marker}% ${next}%`; marker = next; return stop; });
    return { background: `conic-gradient(${stops.join(", ")})` };
  }, [performance.serviceRows]);

  function openNewRecord() { setEditingRecord(null); setForm(emptyRecordForm(fieldSettings)); setNotice(""); setError(""); setIsFormOpen(true); }
  function openEditRecord(record: SalesRecord) {
    setEditingRecord(record);
    setForm(recordToSalesValues(record, fieldSettings));
    setNotice(""); setError(""); setIsFormOpen(true);
  }

  function openMergeRecord(record: SalesRecord) {
    setMergeRecord(record); setDuplicateRecordId(""); setError("");
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setError("");
    const url = editingRecord ? `/api/deals/${editingRecord.id}` : "/api/deals";
    try {
      const response = await fetch(url, { method: editingRecord ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadFromSalesValues(form)) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save the sales record.");
      setIsFormOpen(false); setNotice(editingRecord ? "Sales record updated." : "Sales record added."); await loadWorkspace();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save the sales record."); }
    finally { setIsSaving(false); }
  }

  async function deleteRecord(record: SalesRecord) {
    if (!window.confirm(`Remove ${record.leadName}'s sales record?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/deals/${record.id}`, { method: "DELETE" });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? "Unable to remove sales record."); }
      setNotice("Sales record removed."); await loadWorkspace();
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to remove sales record."); }
  }

  async function mergeDuplicateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mergeRecord || !duplicateRecordId) return;
    const duplicate = records.find((record) => record.id === Number(duplicateRecordId));
    if (!duplicate) { setError("Choose a duplicate sales record to merge."); return; }
    if (!window.confirm(`Merge ${duplicate.leadName} into ${mergeRecord.leadName}? The duplicate entry will be removed.`)) return;
    setIsMerging(true); setError("");
    try {
      const response = await fetch(`/api/deals/${mergeRecord.id}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duplicateRecordId: duplicate.id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to merge the sales records.");
      setMergeRecord(null); setDuplicateRecordId(""); setNotice(`${duplicate.leadName} merged into ${mergeRecord.leadName}.`); await loadWorkspace();
    } catch (mergeError) { setError(mergeError instanceof Error ? mergeError.message : "Unable to merge the sales records."); }
    finally { setIsMerging(false); }
  }

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activityRecord) return;
    setIsAddingActivity(true); setError("");
    try {
      const response = await fetch(`/api/deals/${activityRecord.id}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityType, content: activityText }) });
      const payload = await response.json() as { activity?: SalesActivity; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to add the activity.");
      setActivities((current) => payload.activity ? [payload.activity, ...current] : current); setActivityText(""); setNotice("Activity added.");
    } catch (activityError) { setError(activityError instanceof Error ? activityError.message : "Unable to add the activity."); }
    finally { setIsAddingActivity(false); }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (file.size > 2_000_000) { setError("Choose a CSV smaller than 2 MB."); return; }
    setIsImporting(true); setError("");
    try {
      const importedRows = csvRecords(await file.text(), fieldSettings);
      const response = await fetch("/api/deals/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: importedRows }) });
      const payload = await response.json() as { imported?: number; existing?: number; notesAdded?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to import the CSV.");
      const imported = payload.imported ?? importedRows.length;
      const notesAdded = payload.notesAdded ?? 0;
      const existing = payload.existing ?? 0;
      const message = imported
        ? `${imported} sales records imported${notesAdded ? ` and ${notesAdded} activity notes added` : ""}.`
        : notesAdded
          ? `${notesAdded} activity notes added to ${existing} existing sales records.`
          : "No new sales records or activity notes were found in this CSV.";
      setNotice(message); await loadWorkspace();
    } catch (importError) { setError(importError instanceof Error ? importError.message : "Unable to import the CSV."); }
    finally { setIsImporting(false); }
  }

  async function exportCsv() {
    setIsExporting(true); setError("");
    try {
      const response = await fetch("/api/deals/export", { cache: "no-store" });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? "Unable to export the CSV."); }
      const url = URL.createObjectURL(await response.blob()); const download = document.createElement("a");
      download.href = url; download.download = "rosetta-sales-records.csv"; document.body.appendChild(download); download.click(); download.remove(); URL.revokeObjectURL(url);
      setNotice("CSV export is ready.");
    } catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Unable to export the CSV."); }
    finally { setIsExporting(false); }
  }

  function openNewClientFollowUp() { setEditingClientFollowUp(null); setClientForm(emptyClientFollowUpForm(fieldSettings)); setError(""); setIsClientFormOpen(true); }
  function openEditClientFollowUp(item: ClientFollowUp) {
    setEditingClientFollowUp(item);
    const relationship = careFields(fieldSettings).find((field) => field.fieldKey === "relationshipType");
    const satisfaction = careFields(fieldSettings).find((field) => field.fieldKey === "satisfactionStatus");
    const nextAction = careFields(fieldSettings).find((field) => field.fieldKey === "nextAction");
    setClientForm({
      salesRecordId: item.salesRecordId ? String(item.salesRecordId) : "",
      clientName: item.clientName,
      relationshipType: relationship?.inputType === "multiselect" ? parseStoredValues(item.relationshipType) : item.relationshipType,
      lastEngagementAt: item.lastEngagementAt ?? "",
      lastCheckInAt: item.lastCheckInAt ?? "",
      satisfactionStatus: satisfaction?.inputType === "multiselect" ? parseStoredValues(item.satisfactionStatus) : item.satisfactionStatus,
      nextFollowUpAt: item.nextFollowUpAt ?? "",
      nextAction: nextAction?.inputType === "multiselect" ? parseStoredValues(item.nextAction) : item.nextAction,
      expansionOpportunity: item.expansionOpportunity,
    });
    setError(""); setIsClientFormOpen(true);
  }
  async function saveClientFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setError("");
    const url = editingClientFollowUp ? `/api/client-follow-ups/${editingClientFollowUp.id}` : "/api/client-follow-ups";
    try {
      const response = await fetch(url, { method: editingClientFollowUp ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clientForm) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save the client follow-up.");
      setIsClientFormOpen(false); setNotice(editingClientFollowUp ? "Client follow-up updated." : "Client follow-up added."); await loadWorkspace();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save the client follow-up."); }
    finally { setIsSaving(false); }
  }
  async function deleteClientFollowUp(item: ClientFollowUp) {
    if (!window.confirm(`Remove the client-care record for ${item.clientName}?`)) return;
    try {
      const response = await fetch(`/api/client-follow-ups/${item.id}`, { method: "DELETE" });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? "Unable to remove client follow-up."); }
      setNotice("Client follow-up removed."); await loadWorkspace();
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to remove client follow-up."); }
  }

  if (!access) return <main className="access-shell"><section className="access-card"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" />{accessError ? <><p className="eyebrow">Sales performance</p><h1>Unable to load access</h1><p className="heading-copy">{accessError}</p><button className="primary-action access-action" type="button" onClick={() => void loadAccess()}>Try again</button></> : <p className="heading-copy">Checking access...</p>}</section></main>;
  if (!access.user || (!access.legacy && !access.configured)) return <AccessGate configured={access.configured} />;

  const isAdmin = access.user.role === "admin";
  const labels = fieldSettings.labels;
  const lists = fieldSettings.lists;
  const pageTitle = activeView === "overview" ? labels.headingOverview : activeView === "records" ? labels.headingSalesRecords : labels.headingClientCare;
  const pageDescription = activeView === "overview" ? labels.descOverview : activeView === "records" ? labels.descSalesRecords : labels.descClientCare;
  const recordFilters: { key: RecordFilter; label: string }[] = [
    { key: "all", label: labels.filterAllLeads },
    { key: "overdue", label: labels.filterOverdue },
    { key: "today", label: labels.filterDueToday },
    { key: "next7", label: labels.filterNext7Days },
    { key: "none", label: labels.filterNoFollowUpDate },
  ];
  const salesSections = ["sales_lead", "sales_contact", "sales_service", "sales_next"] as const;
  const careSections = ["care_relationship", "care_checkin"] as const;
  const visibleSalesFields = salesFields(fieldSettings);
  const visibleCareFields = careFields(fieldSettings);

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{labels.productName}</span></div><div className="topbar-actions">{access.configured ? <SettingsMenu labels={labels} role={access.user.role} /> : null}</div></header>
    {mergeRecord ? <div className="modal-backdrop" role="presentation"><form className="record-modal merge-modal" onSubmit={mergeDuplicateRecord}><div className="modal-heading"><div><p className="eyebrow">Duplicate records</p><h2>{labels.mergeHeading}</h2></div><button type="button" className="icon-button" aria-label="Close merge duplicate form" onClick={() => setMergeRecord(null)}>x</button></div><p className="heading-copy"><strong>{mergeRecord.leadName}</strong> {labels.mergeCopy}</p><label className="merge-select">{labels.mergeDuplicateLabel}<select required value={duplicateRecordId} onChange={(event) => setDuplicateRecordId(event.target.value)}><option value="">{labels.mergeSelectPlaceholder}</option>{records.filter((record) => record.id !== mergeRecord.id).map((record) => <option key={record.id} value={record.id}>{record.leadName}{record.company ? ` - ${record.company}` : ""}</option>)}</select></label><p className="table-note">{labels.mergeNote}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setMergeRecord(null)} disabled={isMerging}>{labels.formCancel}</button><button type="submit" className="primary-action" disabled={isMerging || !duplicateRecordId}>{isMerging ? labels.mergeMerging : labels.mergeAction}</button></div></form></div> : null}
    <div className="workspace">
      <nav className="section-tabs" aria-label="Dashboard sections"><button type="button" className={activeView === "overview" ? "tab is-active" : "tab"} onClick={() => setActiveView("overview")}>{labels.tabOverview}</button><button type="button" className={activeView === "records" ? "tab is-active" : "tab"} onClick={() => setActiveView("records")}>{labels.tabSalesRecords} <span className="tab-count">{records.length}</span></button><button type="button" className={activeView === "client-care" ? "tab is-active" : "tab"} onClick={() => setActiveView("client-care")}>{labels.tabClientCare} <span className="tab-count">{clientFollowUps.length}</span></button></nav>
      <section className="page-heading"><div><p className="eyebrow">{labels.eyebrowRosetta}</p><h1>{pageTitle}</h1><p className="heading-copy">{pageDescription}</p></div><button type="button" className="primary-action" onClick={activeView === "client-care" ? openNewClientFollowUp : openNewRecord}><span aria-hidden="true">+</span>{activeView === "client-care" ? labels.ctaAddClientFollowUp : labels.ctaAddSalesRecord}</button></section>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error && !isFormOpen && !isClientFormOpen && !activityRecord && !mergeRecord ? <div className="notice is-error" role="alert">{error}</div> : null}
      {isLoading ? <p className="loading-copy">{labels.loadingWorkspace}</p> : null}
      {!isLoading && activeView === "overview" ? <>
        <section className="filter-bar" aria-label="Performance filters"><label><span>{labels.filterRequestReceivedBy}</span><select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value={ALL_OWNERS}>{labels.filterRequestReceivedBy}</option>{owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label><label><span>{labels.filterPeriod}</span><select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}><option value="all">{labels.periodAllTime}</option><option value="last90">{labels.periodLast90Days}</option><option value="quarter">{labels.periodThisQuarter}</option></select></label><p className="record-count">{visibleRecords.length} {visibleRecords.length === 1 ? "record" : "records"} {labels.recordsShownSuffix}</p></section>
        <section className="metrics-grid" aria-label="Sales metrics"><article className="metric-card metric-revenue"><span>{labels.metricBookedRevenue}</span><strong>{shortMoney(performance.bookedRevenue)}</strong><small>{performance.won.length} {labels.metricBookedRevenueHint}</small></article><article className="metric-card metric-pipeline"><span>{labels.metricOpenPipeline}</span><strong>{shortMoney(performance.pipelineRevenue)}</strong><small>{performance.active.length} {labels.metricOpenPipelineHint}</small></article><article className="metric-card metric-action"><span>{labels.metricFollowUpsDue}</span><strong>{followUpQueue.length}</strong><small>{labels.metricFollowUpsDueHint}</small></article><article className="metric-card metric-care"><span>{labels.metricClientCare}</span><strong>{careNeedingAttention}</strong><small>{labels.metricClientCareHint}</small></article></section>
        <section className="worklist-section"><div className="panel-heading"><div><p className="eyebrow">{labels.queueEyebrow}</p><h2>{labels.queueHeading}</h2></div><button type="button" className="text-action" onClick={() => { setActiveView("records"); setRecordFilter("overdue"); }}>{labels.queueReviewLeads}</button></div>{followUpQueue.length ? <div className="queue-list">{followUpQueue.slice(0, 6).map((record) => <button type="button" className="queue-item" key={record.id} onClick={isAdmin ? () => openEditRecord(record) : undefined}><span className={`due-indicator due-${followUpState(record.nextFollowUpAt)}`} /><span><strong>{record.leadName}</strong><small>{choiceLabel(lists.followUpActions, record.nextAction, labels.queueActionUndefined)}</small></span><span className="queue-date">{dateLabel(record.nextFollowUpAt, labels.notScheduled)}<small>{followUpLabel(record, labels)}</small></span></button>)}</div> : <p className="empty-copy">{labels.queueEmpty}</p>}</section>
        <section className="performance-layout"><article className="service-circle-panel"><div className="panel-heading"><div><p className="eyebrow">{labels.circleEyebrow}</p><h2>{labels.circleHeading}</h2></div><span className="panel-value">{shortMoney(performance.bookedRevenue)}</span></div><div className="circle-content"><div className="donut" style={donutStyle} aria-label={labels.circleHeading}><div className="donut-core"><strong>{performance.serviceRows.length}</strong><span>{labels.donutServices}</span></div></div><div className="service-legend">{performance.serviceRows.length ? performance.serviceRows.map((row, index) => <div className="legend-row" key={row.service}><span className="legend-swatch" style={{ background: chartColors[index % chartColors.length] }} /><span>{choiceLabel(lists.services, row.service.split(" · "))}</span><strong>{money(row.revenue)}</strong></div>) : <p className="empty-copy">{labels.circleEmpty}</p>}</div></div></article><article className="source-panel"><div className="panel-heading"><div><p className="eyebrow">{labels.careEyebrow}</p><h2>{labels.careHeading}</h2></div></div><div className="care-summary"><strong>{clientFollowUps.length}</strong><span>{labels.careActiveSuffix}</span></div><div className="care-status-list">{lists.satisfactionStatuses.map((status) => <div className="care-status-row" key={status.value}><span>{status.label}</span><strong>{clientFollowUps.filter((item) => includesChoice(item.satisfactionStatus, status.value)).length}</strong></div>)}</div><button type="button" className="secondary-action full-width-action" onClick={() => setActiveView("client-care")}>{labels.careOpenButton}</button></article></section>
        <section className="pivot-section"><div className="pivot-heading"><p className="eyebrow">{labels.pivotEyebrow}</p><h2>{labels.pivotHeading}</h2><p className="table-note">{labels.pivotNote}</p></div><div className="table-wrap"><table><thead><tr><th>{labels.pivotColService}</th><th>{labels.pivotColLeads}</th><th>{labels.pivotColWon}</th><th>{labels.pivotColWinRate}</th><th>{labels.pivotColPipeline}</th><th>{labels.pivotColRevenue}</th></tr></thead><tbody>{performance.serviceRows.map((row) => <tr key={row.service}><td><strong>{choiceLabel(lists.services, row.service.split(" · "))}</strong></td><td>{row.leads}</td><td>{row.won}</td><td>{row.winRate}%</td><td>{money(row.pipeline)}</td><td className="revenue-cell">{money(row.revenue)}</td></tr>)}</tbody></table>{!performance.serviceRows.length ? <p className="empty-table">{labels.pivotEmpty}</p> : null}</div></section>
      </> : null}
      {!isLoading && activeView === "records" ? <>
        {isAdmin ? <section className="records-toolbar"><p>{labels.importToolbarCopy}</p><div className="records-actions"><input ref={importInputRef} className="file-input" type="file" accept=".csv,text/csv" onChange={importCsv} /><button type="button" className="secondary-action" onClick={() => importInputRef.current?.click()} disabled={isImporting}>{isImporting ? "Importing..." : labels.importCsv}</button><button type="button" className="secondary-action" onClick={exportCsv} disabled={isExporting}>{isExporting ? "Exporting..." : labels.exportCsv}</button></div></section> : null}
        <div className="lead-search"><label htmlFor="lead-search">{labels.searchLeads}</label><input id="lead-search" type="search" value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder={labels.searchPlaceholder} /></div>
        <section className="record-filter-row" aria-label="Lead worklist filters">{recordFilters.map((filter) => <button type="button" key={filter.key} className={recordFilter === filter.key ? "filter-chip is-active" : "filter-chip"} onClick={() => setRecordFilter(filter.key)}>{filter.label}</button>)}</section>
        <section className="records-section records-table">
          <div className="table-wrap"><table>
            <thead><tr>
              {columnVisible(fieldSettings, "sales_records", "leadContact") ? <th>{columnLabel(fieldSettings, "sales_records", "leadContact", "Lead & contact")}</th> : null}
              {columnVisible(fieldSettings, "sales_records", "service") ? <th>{columnLabel(fieldSettings, "sales_records", "service", "Service")}</th> : null}
              {columnVisible(fieldSettings, "sales_records", "statusMeeting") ? <th>{columnLabel(fieldSettings, "sales_records", "statusMeeting", "Status & meeting")}</th> : null}
              {columnVisible(fieldSettings, "sales_records", "nextAction") ? <th>{columnLabel(fieldSettings, "sales_records", "nextAction", "Next action")}</th> : null}
              {columnVisible(fieldSettings, "sales_records", "source") ? <th>{columnLabel(fieldSettings, "sales_records", "source", "Source")}</th> : null}
              {columnVisible(fieldSettings, "sales_records", "value") ? <th>{columnLabel(fieldSettings, "sales_records", "value", "Value")}</th> : null}
              {isAdmin && columnVisible(fieldSettings, "sales_records", "actions") ? <th aria-label="Actions" /> : null}
            </tr></thead>
            <tbody>{visibleRecords.map((record) => <tr key={record.id}>
              {columnVisible(fieldSettings, "sales_records", "leadContact") ? <td><strong>{record.leadName}</strong><small>{record.contactName || record.company || labels.contactNotAdded}{record.contactTitle ? ` \u00b7 ${record.contactTitle}` : ""}</small></td> : null}
              {columnVisible(fieldSettings, "sales_records", "service") ? <td>{choiceLabel(lists.services, record.service)}{includesChoice(record.service, SCHEDULED_INTERPRETATION_SERVICE) ? <small>{choiceLabel(lists.interpretationDeliveries, record.serviceDelivery)}{" \u00b7 "}{choiceLabel(lists.interpretationModes, record.interpretationMode)}</small> : null}</td> : null}
              {columnVisible(fieldSettings, "sales_records", "statusMeeting") ? <td><span className={stageClass(parseStoredValues(record.stage)[0] ?? record.stage)}>{choiceLabel(lists.statuses, record.stage)}</span><small>{choiceLabel(lists.meetingStages, record.meetingStage)}</small></td> : null}
              {columnVisible(fieldSettings, "sales_records", "nextAction") ? <td><span className={`follow-up-tag follow-up-${followUpState(record.nextFollowUpAt)}`}>{followUpLabel(record, labels)}</span><small>{choiceLabel(lists.followUpActions, record.nextAction, labels.actionNotSet)}{" \u00b7 "}{dateLabel(record.nextFollowUpAt, labels.notScheduled)}</small></td> : null}
              {columnVisible(fieldSettings, "sales_records", "source") ? <td>{choiceLabel(lists.sourceTypes, record.sourceType)}<small>{record.referredBy || record.requestReceivedBy}</small></td> : null}
              {columnVisible(fieldSettings, "sales_records", "value") ? <td className="revenue-cell">{money(record.estimatedRevenueCents)}<small>{choiceLabel(lists.opportunityTypes, record.opportunityType)}</small></td> : null}
              {isAdmin && columnVisible(fieldSettings, "sales_records", "actions") ? <td><div className="row-actions"><button type="button" onClick={() => void loadActivities(record)}>Activity</button><button type="button" onClick={() => openEditRecord(record)}>Edit</button><button type="button" onClick={() => openMergeRecord(record)}>Merge</button><button type="button" className="delete-button" onClick={() => void deleteRecord(record)}>Delete</button></div></td> : null}
            </tr>)}</tbody>
          </table>{!visibleRecords.length ? <p className="empty-table">{labels.emptyLeads}</p> : null}</div>
        </section>
      </> : null}
      {!isLoading && activeView === "client-care" ? <section className="records-section client-care-section"><div className="client-care-heading"><div><p className="eyebrow">{labels.careSectionEyebrow}</p><h2>{labels.careSectionHeading}</h2><p className="table-note">{labels.careSectionNote}</p>{fieldSettings.includeWonLeadsInClientCare ? <p className="table-note">{labels.careWonLeadsNote}</p> : null}</div></div><div className="table-wrap"><table><thead><tr>
        {columnVisible(fieldSettings, "client_care", "client") ? <th>{columnLabel(fieldSettings, "client_care", "client", "Client")}</th> : null}
        {columnVisible(fieldSettings, "client_care", "relationship") ? <th>{columnLabel(fieldSettings, "client_care", "relationship", "Relationship")}</th> : null}
        {columnVisible(fieldSettings, "client_care", "satisfaction") ? <th>{columnLabel(fieldSettings, "client_care", "satisfaction", "Satisfaction")}</th> : null}
        {columnVisible(fieldSettings, "client_care", "lastCheckIn") ? <th>{columnLabel(fieldSettings, "client_care", "lastCheckIn", "Last check-in")}</th> : null}
        {columnVisible(fieldSettings, "client_care", "nextAction") ? <th>{columnLabel(fieldSettings, "client_care", "nextAction", "Next action")}</th> : null}
        {columnVisible(fieldSettings, "client_care", "nextFollowUp") ? <th>{columnLabel(fieldSettings, "client_care", "nextFollowUp", "Next follow-up")}</th> : null}
        {columnVisible(fieldSettings, "client_care", "actions") ? <th aria-label="Actions" /> : null}
      </tr></thead><tbody>{clientFollowUps.map((item) => <tr key={item.id}>
        {columnVisible(fieldSettings, "client_care", "client") ? <td><strong>{item.clientName}</strong><small>{item.linkedLeadName ? `${labels.linkedToPrefix} ${item.linkedLeadName}` : labels.notLinkedLead}</small></td> : null}
        {columnVisible(fieldSettings, "client_care", "relationship") ? <td>{choiceLabel(lists.relationshipTypes, item.relationshipType)}<small>Last service: {dateLabel(item.lastEngagementAt, labels.notScheduled)}</small></td> : null}
        {columnVisible(fieldSettings, "client_care", "satisfaction") ? <td><span className={`care-status care-${(parseStoredValues(item.satisfactionStatus)[0] ?? item.satisfactionStatus).toLowerCase().replaceAll(" ", "-")}`}>{choiceLabel(lists.satisfactionStatuses, item.satisfactionStatus)}</span></td> : null}
        {columnVisible(fieldSettings, "client_care", "lastCheckIn") ? <td>{dateLabel(item.lastCheckInAt, labels.notScheduled)}</td> : null}
        {columnVisible(fieldSettings, "client_care", "nextAction") ? <td>{choiceLabel(lists.followUpActions, item.nextAction, labels.actionNotSet)}<small>{item.expansionOpportunity || labels.noExpansionNote}</small></td> : null}
        {columnVisible(fieldSettings, "client_care", "nextFollowUp") ? <td><span className={`follow-up-tag follow-up-${followUpState(item.nextFollowUpAt)}`}>{dateLabel(item.nextFollowUpAt, labels.notScheduled)}</span></td> : null}
        {columnVisible(fieldSettings, "client_care", "actions") ? <td><div className="row-actions"><button type="button" onClick={() => openEditClientFollowUp(item)}>Edit</button><button type="button" className="delete-button" onClick={() => void deleteClientFollowUp(item)}>Delete</button></div></td> : null}
      </tr>)}</tbody></table>{!clientFollowUps.length ? <p className="empty-table">{labels.emptyClients}</p> : null}</div></section> : null}
    </div>

    {isFormOpen ? <div className="modal-backdrop" role="presentation"><form className="record-modal" onSubmit={saveRecord}><div className="modal-heading"><div><p className="eyebrow">{labels.formLeadWorkspace}</p><h2>{editingRecord ? labels.formUpdateSalesRecord : labels.ctaAddSalesRecord}</h2></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setIsFormOpen(false)}>×</button></div>
      {salesSections.map((sectionKey) => {
        const sectionFields = visibleSalesFields.filter((field) => field.sectionKey === sectionKey && showSalesField(field, form, Boolean(editingRecord)));
        if (!sectionFields.length && !(sectionKey === "sales_next" && editingRecord)) return null;
        return <div className="form-section" key={sectionKey}><h3>{sectionTitle(fieldSettings, sectionKey, labels.sectionSalesLead)}</h3><div className="form-grid">
          {sectionFields.map((field) => (
            <SchemaField
              key={field.fieldKey}
              field={field}
              value={form[field.fieldKey] ?? (field.inputType === "multiselect" ? [] : "")}
              options={field.listKey ? lists[field.listKey] : undefined}
              extraOptions={field.fieldKey === "requestReceivedBy" ? requestReceivedOptions : []}
              required={salesFieldRequired(field, form)}
              optionalMark={labels.optionalMark}
              selectPlaceholder={labels.selectPlaceholder}
              onChange={(next) => setForm(applySalesFieldChange(form, field, next, fieldSettings))}
            />
          ))}
          {sectionKey === "sales_next" && editingRecord ? <div className="wide-field note-section"><div><h3>{labels.activityNotesHeading}</h3><p className="table-note">{labels.activityNotesHint}</p></div><button type="button" className="secondary-action" onClick={() => void loadActivities(editingRecord)}>{labels.activityAddNote}</button></div> : null}
        </div></div>;
      })}
      {error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setIsFormOpen(false)}>{labels.formCancel}</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? labels.formSaving : editingRecord ? labels.formSaveChanges : labels.ctaAddSalesRecord}</button></div></form></div> : null}
    {activityRecord ? <div className="modal-backdrop" role="presentation"><section className="record-modal activity-modal"><div className="modal-heading"><div><p className="eyebrow">{labels.activityHistory}</p><h2>{activityRecord.leadName}</h2></div><button type="button" className="icon-button" aria-label="Close activity history" onClick={() => setActivityRecord(null)}>×</button></div><form className="activity-form" onSubmit={addActivity}><label>{fieldSettings.fields.find((field) => field.entity === "activity" && field.fieldKey === "activityType")?.label ?? "Activity type"}<select value={activityType} onChange={(event) => setActivityType(event.target.value)}>{lists.activityTypes.filter((option) => option.isActive || option.value === activityType).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>{fieldSettings.fields.find((field) => field.entity === "activity" && field.fieldKey === "content")?.label ?? "New note"}<textarea required rows={3} value={activityText} onChange={(event) => setActivityText(event.target.value)} placeholder={fieldSettings.fields.find((field) => field.entity === "activity" && field.fieldKey === "content")?.helpText || "What happened, what was sent, or what was agreed?"} /></label><button type="submit" className="primary-action" disabled={isAddingActivity}>{isAddingActivity ? labels.activityAdding : labels.activityAddNote}</button></form>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="activity-list">{activities.length ? activities.map((activity) => <article className="activity-item" key={activity.id}><div><span className="activity-type">{labelFor(lists.activityTypes, activity.activityType)}</span><time>{dateTimeLabel(activity.createdAt)}</time></div><p>{activity.content}</p></article>) : <p className="empty-copy">{labels.activityEmpty}</p>}</div></section></div> : null}
    {isClientFormOpen ? <div className="modal-backdrop" role="presentation"><form className="record-modal" onSubmit={saveClientFollowUp}><div className="modal-heading"><div><p className="eyebrow">{labels.formClientCare}</p><h2>{editingClientFollowUp ? labels.formUpdateClientFollowUp : labels.ctaAddClientFollowUp}</h2></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setIsClientFormOpen(false)}>×</button></div>
      {careSections.map((sectionKey) => {
        const sectionFields = visibleCareFields.filter((field) => field.sectionKey === sectionKey);
        if (!sectionFields.length) return null;
        return <div className="form-section" key={sectionKey}><h3>{sectionTitle(fieldSettings, sectionKey, labels.sectionCareRelationship)}</h3><div className="form-grid">
          {sectionFields.map((field) => field.fieldKey === "salesRecordId" ? (
            <label key={field.fieldKey}>{field.label}{field.isRequired ? null : <span className="optional"> {labels.optionalMark}</span>}<select value={clientForm.salesRecordId} onChange={(event) => { const selected = records.find((record) => record.id === Number(event.target.value)); setClientForm({ ...clientForm, salesRecordId: event.target.value, clientName: selected ? selected.leadName : clientForm.clientName }); }}><option value="">{labels.selectPlaceholder}</option>{records.filter((record) => {
              const linkedElsewhere = clientFollowUps.some((item) => item.salesRecordId === record.id && item.id !== editingClientFollowUp?.id);
              const isCurrentLink = record.id === Number(clientForm.salesRecordId);
              return !linkedElsewhere && (includesChoice(record.stage, WON_STAGE) || isCurrentLink);
            }).map((record) => <option key={record.id} value={record.id}>{record.leadName}</option>)}</select></label>
          ) : (
            <SchemaField
              key={field.fieldKey}
              field={field}
              value={(clientForm as Record<string, FormValue>)[field.fieldKey] ?? (field.inputType === "multiselect" ? [] : "")}
              options={field.listKey ? lists[field.listKey] : undefined}
              optionalMark={labels.optionalMark}
              selectPlaceholder={labels.selectPlaceholder}
              onChange={(next) => setClientForm({ ...clientForm, [field.fieldKey]: next })}
            />
          ))}
        </div></div>;
      })}
      {error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setIsClientFormOpen(false)}>{labels.formCancel}</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? labels.formSaving : editingClientFollowUp ? labels.formSaveChanges : labels.ctaAddClientFollowUp}</button></div></form></div> : null}
  </main>;
}
