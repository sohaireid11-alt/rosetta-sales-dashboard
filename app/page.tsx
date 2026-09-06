"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessGate } from "./access-gate";
import { ContributorForm } from "./contributor-form";
import {
  defaultFieldSettings,
  firstActiveValue,
  labelFor,
  visibleOptions,
  type FieldOption,
  type FieldSettings,
} from "./lib/field-settings-core";
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
type RecordForm = Omit<SalesRecord, "id" | "estimatedRevenueCents" | "bookedRevenueCents" | "nextMeetingAt" | "nextFollowUpAt" | "closedAt"> & {
  dealValue: string;
  nextMeetingAt: string;
  nextFollowUpAt: string;
  closedAt: string;
  initialNote: string;
};
type ClientFollowUpForm = Omit<ClientFollowUp, "id" | "createdAt" | "updatedAt" | "linkedLeadName" | "salesRecordId" | "lastEngagementAt" | "lastCheckInAt" | "nextFollowUpAt"> & {
  salesRecordId: string;
  lastEngagementAt: string;
  lastCheckInAt: string;
  nextFollowUpAt: string;
};
type AccessSession = {
  configured: boolean;
  legacy?: boolean;
  user: { id: number; email: string; displayName: string; role: "admin" | "contributor" } | null;
};

const chartColors = ["#173f78", "#c87daf", "#16856f", "#d6a743", "#4a89a6", "#a46a39", "#7683a4"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function optionNodes(options: FieldOption[] | undefined, currentValue?: string) {
  return visibleOptions(options, currentValue).map((option) => <option key={option.value} value={option.value}>{option.label}</option>);
}

function emptyRecordForm(settings: FieldSettings = defaultFieldSettings()): RecordForm {
  const lists = settings.lists;
  const service = firstActiveValue(lists.services, SCHEDULED_INTERPRETATION_SERVICE);
  const isScheduled = service === SCHEDULED_INTERPRETATION_SERVICE;
  return {
    leadName: "", company: "", organizationType: firstActiveValue(lists.organizationTypes, "Individual"), sourceType: firstActiveValue(lists.sourceTypes, "Direct enquiry"), referredBy: "", requestReceivedBy: "Admin",
    service, serviceDelivery: isScheduled ? firstActiveValue(lists.interpretationDeliveries, "In-person") : "", interpretationMode: isScheduled ? firstActiveValue(lists.interpretationModes, "Consecutive") : "", opportunityType: firstActiveValue(lists.opportunityTypes, "One-time project"), stage: firstActiveValue(lists.statuses, "New"),
    contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", meetingStage: firstActiveValue(lists.meetingStages, "No meeting yet"), nextMeetingAt: "", nextFollowUpAt: "", nextAction: "",
    dealValue: "", createdAt: today(), closedAt: "", initialNote: "",
  };
}

function emptyClientFollowUpForm(settings: FieldSettings = defaultFieldSettings()): ClientFollowUpForm {
  const lists = settings.lists;
  return {
    salesRecordId: "", clientName: "", relationshipType: firstActiveValue(lists.relationshipTypes, "Recurring client"), lastEngagementAt: "", lastCheckInAt: "", satisfactionStatus: firstActiveValue(lists.satisfactionStatuses, "Healthy"),
    nextFollowUpAt: "", nextAction: "", expansionOpportunity: "",
  };
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

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
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
    const service = legacyService(cell(row, indexes.service), serviceValues);
    return {
      leadName: cell(row, indexes.leadName), company: cell(row, indexes.company),
      organizationType: cell(row, indexes.organizationType) || firstActiveValue(lists.organizationTypes, "Individual"), sourceType: legacySource(cell(row, indexes.sourceType), sourceValues),
      referredBy: cell(row, indexes.referredBy), requestReceivedBy: cell(row, indexes.requestReceivedBy) || "Admin", service,
      serviceDelivery: cell(row, indexes.serviceDelivery) || (service === SCHEDULED_INTERPRETATION_SERVICE ? firstActiveValue(lists.interpretationDeliveries, "In-person") : ""),
      interpretationMode: cell(row, indexes.interpretationMode) || (service === SCHEDULED_INTERPRETATION_SERVICE ? firstActiveValue(lists.interpretationModes, "Consecutive") : ""),
      opportunityType: cell(row, indexes.opportunityType) || firstActiveValue(lists.opportunityTypes, "One-time project"), stage: legacyStatus(cell(row, indexes.stage), statusValues),
      contactName: cell(row, indexes.contactName), contactTitle: cell(row, indexes.contactTitle), contactEmail: cell(row, indexes.contactEmail), contactPhone: cell(row, indexes.contactPhone),
      meetingStage: cell(row, indexes.meetingStage) || firstActiveValue(lists.meetingStages, "No meeting yet"), nextMeetingAt: cell(row, indexes.nextMeetingAt), nextFollowUpAt: cell(row, indexes.nextFollowUpAt),
      nextAction: cell(row, indexes.nextAction), dealValue: cell(row, indexes.dealValue), createdAt: cell(row, indexes.createdAt), closedAt: cell(row, indexes.closedAt),
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

function followUpLabel(record: SalesRecord) {
  const state = followUpState(record.nextFollowUpAt);
  if (state === "overdue") return "Overdue";
  if (state === "today") return "Due today";
  if (state === "next7") return "Next 7 days";
  if (state === "none") return "No date";
  return "Scheduled";
}

export default function Home() {
  const [access, setAccess] = useState<AccessSession | null>(null);
  const [fieldSettings, setFieldSettings] = useState<FieldSettings>(defaultFieldSettings);
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clientFollowUps, setClientFollowUps] = useState<ClientFollowUp[]>([]);
  const [activeView, setActiveView] = useState<"overview" | "records" | "client-care">("overview");
  const [recordFilter, setRecordFilter] = useState("All leads");
  const [recordSearch, setRecordSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("All requests");
  const [timeFilter, setTimeFilter] = useState("All time");
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
      const clientPayload = await clientResponse.json() as { followUps?: ClientFollowUp[] };
      const settingsPayload = await settingsResponse.json() as FieldSettings & { error?: string };
      if (!recordsResponse.ok) throw new Error(recordsPayload.error ?? "Unable to load sales records.");
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
  useEffect(() => { if (access?.user?.role === "admin") void loadWorkspace(); }, [access?.user?.role]);

  const requestReceivedOptions = useMemo(
    () => Array.from(new Set(["Admin", "Fady", ...teamMembers.map((member) => member.name)])),
    [teamMembers]
  );
  const owners = useMemo(() => ["All requests", ...Array.from(new Set(records.map((record) => record.requestReceivedBy))).sort()], [records]);
  const visibleRecords = useMemo(() => {
    const now = new Date(); const cutoff = new Date(now);
    const searchQuery = recordSearch.trim().toLocaleLowerCase();
    const phoneQuery = searchQuery.replace(/\D/g, "");
    if (timeFilter === "Last 90 days") cutoff.setDate(now.getDate() - 90);
    if (timeFilter === "This quarter") cutoff.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
    return records.filter((record) => {
      const state = followUpState(record.nextFollowUpAt);
      const recordMatches = recordFilter === "All leads" || (recordFilter === "Due today" && state === "today") || (recordFilter === "Overdue" && state === "overdue") || (recordFilter === "Next 7 days" && state === "next7") || (recordFilter === "No follow-up date" && state === "none");
      const nameMatches = !searchQuery || [record.leadName, record.contactName, record.company].some((value) => value.toLocaleLowerCase().includes(searchQuery));
      const phoneMatches = phoneQuery.length > 0 && record.contactPhone.replace(/\D/g, "").includes(phoneQuery);
      const searchMatches = activeView !== "records" || nameMatches || phoneMatches;
      return recordMatches && searchMatches && (ownerFilter === "All requests" || record.requestReceivedBy === ownerFilter) && (timeFilter === "All time" || new Date(`${record.createdAt}T12:00:00`) >= cutoff);
    });
  }, [activeView, ownerFilter, recordFilter, recordSearch, records, timeFilter]);

  const performance = useMemo(() => {
    const closedStages = CLOSED_STAGES as readonly string[];
    const won = visibleRecords.filter((record) => record.stage === WON_STAGE);
    const active = visibleRecords.filter((record) => !closedStages.includes(record.stage));
    const closed = visibleRecords.filter((record) => closedStages.includes(record.stage));
    const bookedRevenue = won.reduce((total, record) => total + record.bookedRevenueCents, 0);
    const pipelineRevenue = active.reduce((total, record) => total + record.estimatedRevenueCents, 0);
    const grouped = new Map<string, { leads: number; won: number; pipeline: number; revenue: number }>();
    visibleRecords.forEach((record) => {
      const row = grouped.get(record.service) ?? { leads: 0, won: 0, pipeline: 0, revenue: 0 };
      row.leads += 1;
      if (record.stage === WON_STAGE) { row.won += 1; row.revenue += record.bookedRevenueCents; }
      if (!closedStages.includes(record.stage)) row.pipeline += record.estimatedRevenueCents;
      grouped.set(record.service, row);
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
    setForm({
      leadName: record.leadName, company: record.company, organizationType: record.organizationType, sourceType: record.sourceType, referredBy: record.referredBy,
      requestReceivedBy: record.requestReceivedBy, service: record.service, serviceDelivery: record.serviceDelivery, interpretationMode: record.interpretationMode,
      opportunityType: record.opportunityType, stage: record.stage, contactName: record.contactName, contactTitle: record.contactTitle, contactEmail: record.contactEmail,
      contactPhone: record.contactPhone, meetingStage: record.meetingStage, nextMeetingAt: record.nextMeetingAt ?? "", nextFollowUpAt: record.nextFollowUpAt ?? "",
      nextAction: record.nextAction, dealValue: String(record.estimatedRevenueCents / 100), createdAt: record.createdAt, closedAt: record.closedAt ?? "", initialNote: "",
    });
    setNotice(""); setError(""); setIsFormOpen(true);
  }

  function openMergeRecord(record: SalesRecord) {
    setMergeRecord(record); setDuplicateRecordId(""); setError("");
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setError("");
    const url = editingRecord ? `/api/deals/${editingRecord.id}` : "/api/deals";
    try {
      const response = await fetch(url, { method: editingRecord ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, dealValue: Number(form.dealValue) }) });
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
    setClientForm({ salesRecordId: item.salesRecordId ? String(item.salesRecordId) : "", clientName: item.clientName, relationshipType: item.relationshipType, lastEngagementAt: item.lastEngagementAt ?? "", lastCheckInAt: item.lastCheckInAt ?? "", satisfactionStatus: item.satisfactionStatus, nextFollowUpAt: item.nextFollowUpAt ?? "", nextAction: item.nextAction, expansionOpportunity: item.expansionOpportunity });
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
  if (access.user.role === "contributor") return <ContributorForm displayName={access.user.displayName} email={access.user.email} />;

  const labels = fieldSettings.labels;
  const lists = fieldSettings.lists;
  const pageTitle = activeView === "overview" ? labels.headingOverview : activeView === "records" ? labels.headingSalesRecords : labels.headingClientCare;
  const pageDescription = activeView === "overview" ? "Revenue performance and the team actions that need attention." : activeView === "records" ? "Lead details, contacts, meetings, and the next required action." : "Protect active relationships and create the next opportunity.";

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{labels.productName}</span></div><div className="topbar-actions">{access.configured ? <><a className="secondary-action" href="/team">Team access</a><a className="secondary-action" href="/field-settings">Field settings</a><form action="/api/auth/logout" method="post"><button className="secondary-action" type="submit">Sign out</button></form></> : null}</div></header>
    {mergeRecord ? <div className="modal-backdrop" role="presentation"><form className="record-modal merge-modal" onSubmit={mergeDuplicateRecord}><div className="modal-heading"><div><p className="eyebrow">Duplicate records</p><h2>Merge duplicate lead</h2></div><button type="button" className="icon-button" aria-label="Close merge duplicate form" onClick={() => setMergeRecord(null)}>x</button></div><p className="heading-copy"><strong>{mergeRecord.leadName}</strong> will remain as the main record. Choose the duplicate entry to combine into it.</p><label className="merge-select">Duplicate record<select required value={duplicateRecordId} onChange={(event) => setDuplicateRecordId(event.target.value)}><option value="">Select duplicate record</option>{records.filter((record) => record.id !== mergeRecord.id).map((record) => <option key={record.id} value={record.id}>{record.leadName}{record.company ? ` - ${record.company}` : ""}</option>)}</select></label><p className="table-note">The duplicate's activity notes and client-care follow-ups move to the main record. Empty contact fields on the main record are filled from the duplicate.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setMergeRecord(null)} disabled={isMerging}>Cancel</button><button type="submit" className="primary-action" disabled={isMerging || !duplicateRecordId}>{isMerging ? "Merging..." : "Merge records"}</button></div></form></div> : null}
    <div className="workspace">
      <nav className="section-tabs" aria-label="Dashboard sections"><button type="button" className={activeView === "overview" ? "tab is-active" : "tab"} onClick={() => setActiveView("overview")}>{labels.tabOverview}</button><button type="button" className={activeView === "records" ? "tab is-active" : "tab"} onClick={() => setActiveView("records")}>{labels.tabSalesRecords} <span className="tab-count">{records.length}</span></button><button type="button" className={activeView === "client-care" ? "tab is-active" : "tab"} onClick={() => setActiveView("client-care")}>{labels.tabClientCare} <span className="tab-count">{clientFollowUps.length}</span></button></nav>
      <section className="page-heading"><div><p className="eyebrow">Rosetta Languages</p><h1>{pageTitle}</h1><p className="heading-copy">{pageDescription}</p></div><button type="button" className="primary-action" onClick={activeView === "client-care" ? openNewClientFollowUp : openNewRecord}><span aria-hidden="true">+</span>{activeView === "client-care" ? labels.ctaAddClientFollowUp : labels.ctaAddSalesRecord}</button></section>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error && !isFormOpen && !isClientFormOpen && !activityRecord && !mergeRecord ? <div className="notice is-error" role="alert">{error}</div> : null}
      {isLoading ? <p className="loading-copy">Loading Rosetta's workspace...</p> : null}
      {!isLoading && activeView === "overview" ? <>
        <section className="filter-bar" aria-label="Performance filters"><label><span>Request received by</span><select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label><label><span>Period</span><select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}><option>All time</option><option>Last 90 days</option><option>This quarter</option></select></label><p className="record-count">{visibleRecords.length} {visibleRecords.length === 1 ? "record" : "records"} shown</p></section>
        <section className="metrics-grid" aria-label="Sales metrics"><article className="metric-card metric-revenue"><span>Booked revenue</span><strong>{shortMoney(performance.bookedRevenue)}</strong><small>{performance.won.length} won deal{performance.won.length === 1 ? "" : "s"}</small></article><article className="metric-card metric-pipeline"><span>Open pipeline</span><strong>{shortMoney(performance.pipelineRevenue)}</strong><small>{performance.active.length} active opportunities</small></article><article className="metric-card metric-action"><span>Follow-ups due</span><strong>{followUpQueue.length}</strong><small>Overdue, today, or due this week</small></article><article className="metric-card metric-care"><span>Client care attention</span><strong>{careNeedingAttention}</strong><small>Relationships needing a check-in</small></article></section>
        <section className="worklist-section"><div className="panel-heading"><div><p className="eyebrow">Priority worklist</p><h2>Follow-up queue</h2></div><button type="button" className="text-action" onClick={() => { setActiveView("records"); setRecordFilter("Overdue"); }}>Review leads</button></div>{followUpQueue.length ? <div className="queue-list">{followUpQueue.slice(0, 6).map((record) => <button type="button" className="queue-item" key={record.id} onClick={() => openEditRecord(record)}><span className={`due-indicator due-${followUpState(record.nextFollowUpAt)}`} /><span><strong>{record.leadName}</strong><small>{record.nextAction || "Action to be defined"}</small></span><span className="queue-date">{dateLabel(record.nextFollowUpAt)}<small>{followUpLabel(record)}</small></span></button>)}</div> : <p className="empty-copy">No follow-ups are due in the next seven days.</p>}</section>
        <section className="performance-layout"><article className="service-circle-panel"><div className="panel-heading"><div><p className="eyebrow">Full-circle view</p><h2>Booked revenue by service</h2></div><span className="panel-value">{shortMoney(performance.bookedRevenue)}</span></div><div className="circle-content"><div className="donut" style={donutStyle} aria-label="Booked revenue by service"><div className="donut-core"><strong>{performance.serviceRows.length}</strong><span>services</span></div></div><div className="service-legend">{performance.serviceRows.length ? performance.serviceRows.map((row, index) => <div className="legend-row" key={row.service}><span className="legend-swatch" style={{ background: chartColors[index % chartColors.length] }} /><span>{labelFor(lists.services, row.service)}</span><strong>{money(row.revenue)}</strong></div>) : <p className="empty-copy">Won work will appear here as the team records it.</p>}</div></div></article><article className="source-panel"><div className="panel-heading"><div><p className="eyebrow">Relationship health</p><h2>Client satisfaction pipeline</h2></div></div><div className="care-summary"><strong>{clientFollowUps.length}</strong><span>active client follow-up{clientFollowUps.length === 1 ? "" : "s"}</span></div><div className="care-status-list">{lists.satisfactionStatuses.map((status) => <div className="care-status-row" key={status.value}><span>{status.label}</span><strong>{clientFollowUps.filter((item) => item.satisfactionStatus === status.value).length}</strong></div>)}</div><button type="button" className="secondary-action full-width-action" onClick={() => setActiveView("client-care")}>Open client care</button></article></section>
        <section className="pivot-section"><div className="pivot-heading"><p className="eyebrow">Performance pivot</p><h2>Service performance</h2><p className="table-note">A shared view of lead volume, active pipeline, conversion, and booked revenue.</p></div><div className="table-wrap"><table><thead><tr><th>Service</th><th>Leads</th><th>Won</th><th>Win rate</th><th>Open pipeline</th><th>Booked revenue</th></tr></thead><tbody>{performance.serviceRows.map((row) => <tr key={row.service}><td><strong>{labelFor(lists.services, row.service)}</strong></td><td>{row.leads}</td><td>{row.won}</td><td>{row.winRate}%</td><td>{money(row.pipeline)}</td><td className="revenue-cell">{money(row.revenue)}</td></tr>)}</tbody></table>{!performance.serviceRows.length ? <p className="empty-table">Add sales records to build the performance pivot.</p> : null}</div></section>
      </> : null}
      {!isLoading && activeView === "records" ? <>
        <section className="records-toolbar"><p>Import a cleaned sales pipeline when Danyal is ready, or export this current view for reporting.</p><div className="records-actions"><input ref={importInputRef} className="file-input" type="file" accept=".csv,text/csv" onChange={importCsv} /><button type="button" className="secondary-action" onClick={() => importInputRef.current?.click()} disabled={isImporting}>{isImporting ? "Importing..." : "Import CSV"}</button><button type="button" className="secondary-action" onClick={exportCsv} disabled={isExporting}>{isExporting ? "Exporting..." : "Export CSV"}</button></div></section>
        <div className="lead-search"><label htmlFor="lead-search">Search leads</label><input id="lead-search" type="search" value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search name or phone number" /></div>
        <section className="record-filter-row" aria-label="Lead worklist filters">{["All leads", "Overdue", "Due today", "Next 7 days", "No follow-up date"].map((filter) => <button type="button" key={filter} className={recordFilter === filter ? "filter-chip is-active" : "filter-chip"} onClick={() => setRecordFilter(filter)}>{filter}</button>)}</section>
        <section className="records-section records-table">
          <div className="table-wrap"><table>
            <thead><tr><th>Lead & contact</th><th>Service</th><th>Status & meeting</th><th>Next action</th><th>Source</th><th>Value</th><th aria-label="Actions" /></tr></thead>
            <tbody>{visibleRecords.map((record) => <tr key={record.id}>
              <td><strong>{record.leadName}</strong><small>{record.contactName || record.company || "Contact not added"}{record.contactTitle ? ` \u00b7 ${record.contactTitle}` : ""}</small></td>
              <td>{labelFor(lists.services, record.service)}{record.service === SCHEDULED_INTERPRETATION_SERVICE ? <small>{labelFor(lists.interpretationDeliveries, record.serviceDelivery)}{" \u00b7 "}{labelFor(lists.interpretationModes, record.interpretationMode)}</small> : null}</td>
              <td><span className={stageClass(record.stage)}>{labelFor(lists.statuses, record.stage)}</span><small>{labelFor(lists.meetingStages, record.meetingStage)}</small></td>
              <td><span className={`follow-up-tag follow-up-${followUpState(record.nextFollowUpAt)}`}>{followUpLabel(record)}</span><small>{(record.nextAction ? labelFor(lists.followUpActions, record.nextAction) : "Action not set")}{" \u00b7 "}{dateLabel(record.nextFollowUpAt)}</small></td>
              <td>{labelFor(lists.sourceTypes, record.sourceType)}<small>{record.referredBy || record.requestReceivedBy}</small></td>
              <td className="revenue-cell">{money(record.estimatedRevenueCents)}<small>{labelFor(lists.opportunityTypes, record.opportunityType)}</small></td>
              <td><div className="row-actions"><button type="button" onClick={() => void loadActivities(record)}>Activity</button><button type="button" onClick={() => openEditRecord(record)}>Edit</button><button type="button" onClick={() => openMergeRecord(record)}>Merge</button><button type="button" className="delete-button" onClick={() => void deleteRecord(record)}>Delete</button></div></td>
            </tr>)}</tbody>
          </table>{!visibleRecords.length ? <p className="empty-table">No lead matches this worklist.</p> : null}</div>
        </section>
      </> : null}
      {!isLoading && activeView === "client-care" ? <section className="records-section client-care-section"><div className="client-care-heading"><div><p className="eyebrow">Post-conversion pipeline</p><h2>Client satisfaction follow-ups</h2><p className="table-note">Keep a visible cadence with clients and note the next opportunity to support them.</p></div></div><div className="table-wrap"><table><thead><tr><th>Client</th><th>Relationship</th><th>Satisfaction</th><th>Last check-in</th><th>Next action</th><th>Next follow-up</th><th aria-label="Actions" /></tr></thead><tbody>{clientFollowUps.map((item) => <tr key={item.id}><td><strong>{item.clientName}</strong><small>{item.linkedLeadName ? `Linked to ${item.linkedLeadName}` : "Not linked to a sales record"}</small></td><td>{labelFor(lists.relationshipTypes, item.relationshipType)}<small>Last service: {dateLabel(item.lastEngagementAt)}</small></td><td><span className={`care-status care-${item.satisfactionStatus.toLowerCase().replaceAll(" ", "-")}`}>{labelFor(lists.satisfactionStatuses, item.satisfactionStatus)}</span></td><td>{dateLabel(item.lastCheckInAt)}</td><td>{item.nextAction ? labelFor(lists.followUpActions, item.nextAction) : "Action not set"}<small>{item.expansionOpportunity || "No expansion note"}</small></td><td><span className={`follow-up-tag follow-up-${followUpState(item.nextFollowUpAt)}`}>{dateLabel(item.nextFollowUpAt)}</span></td><td><div className="row-actions"><button type="button" onClick={() => openEditClientFollowUp(item)}>Edit</button><button type="button" className="delete-button" onClick={() => void deleteClientFollowUp(item)}>Delete</button></div></td></tr>)}</tbody></table>{!clientFollowUps.length ? <p className="empty-table">Add a converted client to begin the satisfaction follow-up pipeline.</p> : null}</div></section> : null}
    </div>

    {isFormOpen ? <div className="modal-backdrop" role="presentation"><form className="record-modal" onSubmit={saveRecord}><div className="modal-heading"><div><p className="eyebrow">Lead workspace</p><h2>{editingRecord ? "Update sales record" : labels.ctaAddSalesRecord}</h2></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setIsFormOpen(false)}>×</button></div><div className="form-section"><h3>Lead and referral</h3><div className="form-grid"><label>Lead name<input required value={form.leadName} onChange={(event) => setForm({ ...form, leadName: event.target.value })} placeholder="Person or organization" /></label><label>Company <span className="optional">Optional</span><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Organization name" /></label><label>Organization type<select value={form.organizationType} onChange={(event) => setForm({ ...form, organizationType: event.target.value })}>{optionNodes(lists.organizationTypes, form.organizationType)}</select></label><label>Request received by<select value={form.requestReceivedBy} onChange={(event) => setForm({ ...form, requestReceivedBy: event.target.value })}>{requestReceivedOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>Source type<select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}>{optionNodes(lists.sourceTypes, form.sourceType)}</select></label><label>Referred by <span className="optional">Optional</span><input value={form.referredBy} onChange={(event) => setForm({ ...form, referredBy: event.target.value })} placeholder="Person, client, or partner" /></label></div></div><div className="form-section"><h3>Contact person</h3><div className="form-grid"><label>Full name <span className="optional">Optional</span><input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Main contact" /></label><label>Title <span className="optional">Optional</span><input value={form.contactTitle} onChange={(event) => setForm({ ...form, contactTitle: event.target.value })} placeholder="Role or department" /></label><label>Email <span className="optional">Optional</span><input type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} placeholder="name@organization.org" /></label><label>Phone <span className="optional">Optional</span><input value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} placeholder="Phone number" /></label></div></div><div className="form-section"><h3>Service and opportunity</h3><div className="form-grid"><label>Service<select value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value, serviceDelivery: event.target.value === SCHEDULED_INTERPRETATION_SERVICE ? form.serviceDelivery || firstActiveValue(lists.interpretationDeliveries, "In-person") : "", interpretationMode: event.target.value === SCHEDULED_INTERPRETATION_SERVICE ? form.interpretationMode || firstActiveValue(lists.interpretationModes, "Consecutive") : "" })}>{optionNodes(lists.services, form.service)}</select></label><label>Opportunity type<select value={form.opportunityType} onChange={(event) => setForm({ ...form, opportunityType: event.target.value })}>{optionNodes(lists.opportunityTypes, form.opportunityType)}</select></label>{form.service === SCHEDULED_INTERPRETATION_SERVICE ? <><label>Delivery<select value={form.serviceDelivery} onChange={(event) => setForm({ ...form, serviceDelivery: event.target.value })}>{optionNodes(lists.interpretationDeliveries, form.serviceDelivery)}</select></label><label>Interpretation mode<select value={form.interpretationMode} onChange={(event) => setForm({ ...form, interpretationMode: event.target.value })}>{optionNodes(lists.interpretationModes, form.interpretationMode)}</select></label></> : null}<label>Status<select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{optionNodes(lists.statuses, form.stage)}</select></label><label>Deal value (USD)<input required inputMode="decimal" type="number" min="0" step="0.01" value={form.dealValue} onChange={(event) => setForm({ ...form, dealValue: event.target.value })} placeholder="0" /></label><label>Lead date<input required type="date" value={form.createdAt} onChange={(event) => setForm({ ...form, createdAt: event.target.value })} /></label><label>Close date <span className="optional">Optional</span><input type="date" value={form.closedAt} onChange={(event) => setForm({ ...form, closedAt: event.target.value })} /></label></div></div><div className="form-section"><h3>Meetings and next step</h3><div className="form-grid"><label>Meeting stage<select value={form.meetingStage} onChange={(event) => setForm({ ...form, meetingStage: event.target.value })}>{optionNodes(lists.meetingStages, form.meetingStage)}</select></label><label>Next meeting date <span className="optional">Optional</span><input type="date" value={form.nextMeetingAt} onChange={(event) => setForm({ ...form, nextMeetingAt: event.target.value })} /></label><label>Date of next follow-up{form.stage === PENDING_STAGE ? null : <span className="optional"> Optional</span>}<input required={form.stage === PENDING_STAGE} type="date" value={form.nextFollowUpAt} onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })} /></label><label>Action needed{form.stage === PENDING_STAGE ? null : <span className="optional"> Optional</span>}<select required={form.stage === PENDING_STAGE} value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })}><option value="">Select next action</option>{optionNodes(lists.followUpActions, form.nextAction)}</select></label>{editingRecord ? <div className="wide-field note-section"><div><h3>Activity notes</h3><p className="table-note">Each note is saved as its own dated box.</p></div><button type="button" className="secondary-action" onClick={() => void loadActivities(editingRecord)}>Add Note</button></div> : <label className="wide-field">First activity note <span className="optional">Optional</span><textarea rows={3} value={form.initialNote} onChange={(event) => setForm({ ...form, initialNote: event.target.value })} placeholder="A separate dated activity is created; previous notes remain untouched." /></label>}</div></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setIsFormOpen(false)}>Cancel</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Saving..." : editingRecord ? "Save changes" : labels.ctaAddSalesRecord}</button></div></form></div> : null}
    {activityRecord ? <div className="modal-backdrop" role="presentation"><section className="record-modal activity-modal"><div className="modal-heading"><div><p className="eyebrow">Activity history</p><h2>{activityRecord.leadName}</h2></div><button type="button" className="icon-button" aria-label="Close activity history" onClick={() => setActivityRecord(null)}>×</button></div><form className="activity-form" onSubmit={addActivity}><label>Activity type<select value={activityType} onChange={(event) => setActivityType(event.target.value)}>{optionNodes(lists.activityTypes, activityType)}</select></label><label>New note<textarea required rows={3} value={activityText} onChange={(event) => setActivityText(event.target.value)} placeholder="What happened, what was sent, or what was agreed?" /></label><button type="submit" className="primary-action" disabled={isAddingActivity}>{isAddingActivity ? "Adding..." : "Add Note"}</button></form>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="activity-list">{activities.length ? activities.map((activity) => <article className="activity-item" key={activity.id}><div><span className="activity-type">{labelFor(lists.activityTypes, activity.activityType)}</span><time>{dateTimeLabel(activity.createdAt)}</time></div><p>{activity.content}</p></article>) : <p className="empty-copy">No activity yet. Add the first update above.</p>}</div></section></div> : null}
    {isClientFormOpen ? <div className="modal-backdrop" role="presentation"><form className="record-modal" onSubmit={saveClientFollowUp}><div className="modal-heading"><div><p className="eyebrow">Client care</p><h2>{editingClientFollowUp ? "Update client follow-up" : labels.ctaAddClientFollowUp}</h2></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setIsClientFormOpen(false)}>×</button></div><div className="form-section"><h3>Relationship</h3><div className="form-grid"><label>Linked won lead <span className="optional">Optional</span><select value={clientForm.salesRecordId} onChange={(event) => { const selected = records.find((record) => record.id === Number(event.target.value)); setClientForm({ ...clientForm, salesRecordId: event.target.value, clientName: selected ? selected.leadName : clientForm.clientName }); }}><option value="">Select a won lead</option>{records.filter((record) => record.stage === WON_STAGE).map((record) => <option key={record.id} value={record.id}>{record.leadName}</option>)}</select></label><label>Client name<input required value={clientForm.clientName} onChange={(event) => setClientForm({ ...clientForm, clientName: event.target.value })} placeholder="Client or organization" /></label><label>Relationship type<select value={clientForm.relationshipType} onChange={(event) => setClientForm({ ...clientForm, relationshipType: event.target.value })}>{optionNodes(lists.relationshipTypes, clientForm.relationshipType)}</select></label><label>Last service date <span className="optional">Optional</span><input type="date" value={clientForm.lastEngagementAt} onChange={(event) => setClientForm({ ...clientForm, lastEngagementAt: event.target.value })} /></label></div></div><div className="form-section"><h3>Satisfaction check-in</h3><div className="form-grid"><label>Satisfaction status<select value={clientForm.satisfactionStatus} onChange={(event) => setClientForm({ ...clientForm, satisfactionStatus: event.target.value })}>{optionNodes(lists.satisfactionStatuses, clientForm.satisfactionStatus)}</select></label><label>Last satisfaction check-in <span className="optional">Optional</span><input type="date" value={clientForm.lastCheckInAt} onChange={(event) => setClientForm({ ...clientForm, lastCheckInAt: event.target.value })} /></label><label>Next follow-up date <span className="optional">Optional</span><input type="date" value={clientForm.nextFollowUpAt} onChange={(event) => setClientForm({ ...clientForm, nextFollowUpAt: event.target.value })} /></label><label>Next action <span className="optional">Optional</span><select value={clientForm.nextAction} onChange={(event) => setClientForm({ ...clientForm, nextAction: event.target.value })}><option value="">Select next action</option>{optionNodes(lists.followUpActions, clientForm.nextAction)}</select></label><label className="wide-field">Expansion opportunity <span className="optional">Optional</span><textarea rows={3} value={clientForm.expansionOpportunity} onChange={(event) => setClientForm({ ...clientForm, expansionOpportunity: event.target.value })} placeholder="Potential next service, renewal, referral, or expansion." /></label></div></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setIsClientFormOpen(false)}>Cancel</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Saving..." : editingClientFollowUp ? "Save changes" : labels.ctaAddClientFollowUp}</button></div></form></div> : null}
  </main>;
}
