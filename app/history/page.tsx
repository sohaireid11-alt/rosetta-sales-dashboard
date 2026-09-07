"use client";

import { useEffect, useState } from "react";
import { AccessGate } from "../access-gate";
import { BackControl } from "../back-control";
import { defaultFieldSettings, interpolateLabel, type FieldSettings } from "../lib/field-settings-core";
import { SettingsMenu } from "../settings-menu";

type AppRole = "admin" | "contributor";
type Session = {
  configured: boolean;
  user: { id: number; email: string; displayName: string; role: AppRole } | null;
};
type HistoryEvent = {
  id: number;
  createdAt: string;
  actorDisplayName: string;
  summary: string;
};

function timestampLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HistoryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [labels, setLabels] = useState(defaultFieldSettings().labels);
  const [lookbackDays, setLookbackDays] = useState(defaultFieldSettings().historyLookbackDays);
  const [showBackControl, setShowBackControl] = useState(defaultFieldSettings().showBackControl);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const accessResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const access = await accessResponse.json() as Session;
        setSession(access);
        if (!access.user) return;
        const [settingsResponse, historyResponse] = await Promise.all([
          fetch("/api/field-settings", { cache: "no-store" }),
          fetch("/api/history", { cache: "no-store" }),
        ]);
        if (settingsResponse.ok) {
          const settings = await settingsResponse.json() as FieldSettings;
          if (settings.labels) setLabels({ ...defaultFieldSettings().labels, ...settings.labels });
          if (settings.historyLookbackDays) setLookbackDays(settings.historyLookbackDays);
          setShowBackControl(settings.showBackControl ?? defaultFieldSettings().showBackControl);
        }
        const payload = await historyResponse.json() as { events?: HistoryEvent[]; historyLookbackDays?: number; error?: string };
        if (!historyResponse.ok) throw new Error(payload.error ?? "Unable to load change history.");
        setEvents(payload.events ?? []);
        if (payload.historyLookbackDays) setLookbackDays(payload.historyLookbackDays);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load change history.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (!session) return <main className="access-shell"><section className="access-card"><p className="heading-copy">Checking access...</p></section></main>;
  if (!session.configured || !session.user) return <AccessGate configured={session.configured} />;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{labels.historyProductName}</span></div>
      <div className="topbar-actions">
        <BackControl label={labels.navBack} visible={showBackControl} />
        <SettingsMenu labels={labels} role={session.user.role} showDashboard />
      </div>
    </header>
    <section className="team-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{labels.historyEyebrow}</p>
          <h1>{labels.historyHeading}</h1>
          <p className="heading-copy">{labels.historyCopy}</p>
          <p className="table-note">{interpolateLabel(labels.historyWindowHint, { days: lookbackDays })}</p>
        </div>
      </div>
      {error ? <div className="notice is-error" role="alert">{error}</div> : null}
      {isLoading ? <p className="loading-copy">{labels.historyLoading}</p> : null}
      {!isLoading && !events.length ? <p className="empty-copy">{labels.historyEmpty}</p> : null}
      {!isLoading && events.length ? (
        <section className="history-list" aria-label={labels.historyHeading}>
          {events.map((event) => (
            <article className="history-item" key={event.id}>
              <p>{event.summary}</p>
              <time dateTime={event.createdAt}>{timestampLabel(event.createdAt)}</time>
            </article>
          ))}
        </section>
      ) : null}
    </section>
  </main>;
}
