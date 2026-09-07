"use client";

import { useEffect, useState } from "react";
import { AccessGate } from "../access-gate";
import { defaultFieldSettings, reportExportFilename, type FieldSettings, type ReportPreset } from "../lib/field-settings-core";
import { SettingsMenu } from "../settings-menu";

type Session = {
  configured: boolean;
  user: { id: number; email: string; displayName: string; role: "admin" | "contributor" } | null;
};

export default function ReportsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [labels, setLabels] = useState(defaultFieldSettings().labels);
  const [presets, setPresets] = useState<ReportPreset[]>(defaultFieldSettings().reportPresets);
  const [downloadingDays, setDownloadingDays] = useState<number | null>(null);
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
        if (settings.labels) setLabels({ ...defaultFieldSettings().labels, ...settings.labels });
        if (settings.reportPresets?.length) setPresets(settings.reportPresets);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load reports.");
      }
    })();
  }, []);

  async function downloadRange(preset: ReportPreset) {
    setDownloadingDays(preset.days);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/deals/export?days=${preset.days}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to export the CSV.");
      }
      const url = URL.createObjectURL(await response.blob());
      const download = document.createElement("a");
      download.href = url;
      download.download = reportExportFilename(preset.days);
      document.body.appendChild(download);
      download.click();
      download.remove();
      URL.revokeObjectURL(url);
      setNotice(`${preset.label} is ready.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to export the CSV.");
    } finally {
      setDownloadingDays(null);
    }
  }

  if (!session) return <main className="access-shell"><section className="access-card"><p className="heading-copy">Checking access...</p></section></main>;
  if (!session.configured || session.user?.role !== "admin") return <AccessGate configured={session.configured} />;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{labels.reportsProductName}</span></div>
      <div className="topbar-actions">
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
              disabled={downloadingDays !== null}
            >
              {downloadingDays === preset.days ? labels.reportsDownloading : preset.label}
            </button>
          ))}
        </section>
      ) : <p className="empty-copy">{labels.reportsEmpty}</p>}
    </section>
  </main>;
}
