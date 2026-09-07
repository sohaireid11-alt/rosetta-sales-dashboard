"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UiLabels } from "./lib/field-settings-core";

type SettingsRole = "admin" | "contributor";

type SettingsMenuProps = {
  labels: Pick<
    UiLabels,
    "navSettings" | "navDashboard" | "navTeamAccess" | "navHistory" | "navReports" | "navAdminControls" | "navSignOut"
  >;
  role: SettingsRole;
  showDashboard?: boolean;
};

export function SettingsMenu({ labels, role, showDashboard = false }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isAdmin = role === "admin";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={open ? "settings-menu is-open" : "settings-menu"} ref={rootRef}>
      <button
        type="button"
        className="secondary-action settings-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {labels.navSettings}
      </button>
      {open ? (
        <div className="settings-popover" id={menuId} role="menu">
          {showDashboard ? <a role="menuitem" href="/">{labels.navDashboard}</a> : null}
          {isAdmin ? <a role="menuitem" href="/team">{labels.navTeamAccess}</a> : null}
          <a role="menuitem" href="/history">{labels.navHistory}</a>
          {isAdmin ? <a role="menuitem" href="/reports">{labels.navReports}</a> : null}
          {isAdmin ? <a role="menuitem" href="/admin">{labels.navAdminControls}</a> : null}
          <form action="/api/auth/logout" method="post" role="none">
            <button className="settings-sign-out" type="submit" role="menuitem">{labels.navSignOut}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
