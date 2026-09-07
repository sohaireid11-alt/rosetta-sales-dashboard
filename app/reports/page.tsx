"use client";

import { useEffect, useState } from "react";
import { AccessGate } from "../access-gate";
import { BackControl } from "../back-control";
import { defaultFieldSettings, isCustomDateRangeValid, customRangeExportFilename, reportExportFilename, type FieldSettings, type ReportPreset } from "../lib/field-settings-core";
import { SettingsMenu } from "../settings-menu";

type Session = {
  configured: boolean;
  user: { id: number; email: string; displayName: string; role: "admin" | "contributor" } | null;
};

async function downloadCsv(path: string, filename: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json() as { error?: string };
    throw new Error(payload.error ?? "Unable to export the CSV.");
  }
  const url = URL.createObjectURL(await response.blob());
  const download = document.createElement("a");
  download.href = url;
  download.download = filename;
  document.body.appendChild(download);
  download.click();
  download.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [labels, setLabels] = useState(defaultFieldSettings().labels);
  const [presets, setPresets] = useState<ReportPreset[]>(defaultFieldSettings().reportPresets);
  const [customRangeEnabled, setCustomRangeEnabled] = useState(defaultFieldSettings().customReportRangeEnabled);
  const [showBackControl, setShowBackControl] = useState(defaultFieldSettings().showBackControl);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const accessResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const access = await accessResponse.json() as Session;
        setSession(access);
        if (access.user?.role !== "admin") return;
        const settingsResponse = await fetch("/api/field-settings", { cache: "no-store" });
        if (!settingsResponse.ok) throw new Error("Unable to load report settings.");
        const settings = await settingsResponse.json() as FieldSettings;
        const defaults = defaultFieldSettings();
        if (settings.labels) setLabels({ ...defaults.labels, ...settings.labels });
        if (settings.reportPresets?.length) setPresets(settings.reportPresets);
        setCustomRangeEnabled(settings.customReportRangeEnabled ?? defaults.customReportRangeEnabled);
        setShowBackControl(settings.showBackControl ?? defaults.showBackControl);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load reports.");
      }
    })();
  }, []);

  async function downloadRange(preset: ReportPreset) {
    setDownloadingKey(preset.id || String(preset.days));
    setNotice("");
    setError("");
    try {
      await downloadCsv(`/api/deals/export?days=${preset.days}`, reportExportFilename(preset.days));
      setNotice(`${preset.label} is ready.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to export the CSV.");
    } finally {
      setDownloadingKey(null);
    }
  }

  async function downloadCustomRange() {
    setNotice("");
    if (!isCustomDateRangeValid(fromDate, toDate)) {
      setError(labels.reportsCustomInvalid);
      return;
    }
    setDownloadingKey("custom");
    setError("");
    try {
      await downloadCsv(
        `/api/deals/export?start=${encodeURIComponent(fromDate)}&end=${encodeURIComponent(toDate)}`,
        customRangeExportFilename(fromDate, toDate)
      );
      setNotice(labels.reportsCustomReady);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to export the CSV.");
    } finally {
      setDownloadingKey(null);
    }
  }

  if (!session) return <main className="access-shell"><section className="access-card"><p className="heading-copy">Checking access...</p></section></main>;
  if (!session.configured || session.user?.role !== "admin") return <AccessGate configured={session.configured} />;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{labels.reportsProductName}</span></div>
      <div className="topbar-actions">
        <BackControl label={labels.navBack} visible={showBackControl} />
        <SettingsMenu labels={labels} role="admin" showDashboard />
      </div>
    </header>
    <section className="team-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{labels.reportsEyebrow}</p>
          <h1>{labels.reportsHeading}</h1>
          <p className="heading-copy">{labels.reportsCopy}</p>
          <p className="table-note">{labels.reportsNote}</p>
        </div>
      </div>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error ? <div className="notice is-error" role="alert">{error}</div> : null}
      {presets.length ? (
        <section className="reports-actions" aria-label={labels.reportsHeading}>
          {presets.map((preset) => (
            <button
              type="button"
              className="primary-action"
              key={preset.id}
              onClick={() => void downloadRange(preset)}
              disabled={downloadingKey !== null}
            >
              {downloadingKey === (preset.id || String(preset.days)) ? labels.reportsDownloading : preset.label}
            </button>
          ))}
        </section>
      ) : <p className="empty-copy">{labels.reportsEmpty}</p>}
      {customRangeEnabled ? (
        <section className="reports-range" aria-label={labels.reportsCustomHeading}>
          <h2>{labels.reportsCustomHeading}</h2>
          <p className="table-note">{labels.reportsCustomCopy}</p>
          <div className="reports-range-fields">
            <label>
              {labels.reportsFromLabel}
              <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label>
              {labels.reportsToLabel}
              <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={() => void downloadCustomRange()}
            disabled={downloadingKey !== null}
          >
            {downloadingKey === "custom" ? labels.reportsDownloading : labels.reportsCustomDownload}
          </button>
        </section>
      ) : null}
    </section>
  </main>;
}
