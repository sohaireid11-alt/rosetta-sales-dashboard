"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AccessGate } from "../access-gate";
import { defaultFieldSettings, type FieldSettings } from "../lib/field-settings-core";
import { SettingsMenu } from "../settings-menu";

type AppRole = "admin" | "contributor";
type Session = {
  configured: boolean;
  user: { id: number; email: string; displayName: string; role: AppRole } | null;
};
type ManagedUser = {
  id: number;
  email: string;
  displayName: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string;
  mustChangePassword: boolean;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function newTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export default function TeamPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [labels, setLabels] = useState(defaultFieldSettings().labels);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("contributor");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [editingAccessUserId, setEditingAccessUserId] = useState<number | null>(null);
  const [editedRole, setEditedRole] = useState<AppRole>("contributor");
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    const accessResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const access = await accessResponse.json() as Session;
    setSession(access);
    if (access.user?.role !== "admin") return;
    const settingsResponse = await fetch("/api/field-settings", { cache: "no-store" });
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json() as FieldSettings;
      if (settings.labels) setLabels({ ...defaultFieldSettings().labels, ...settings.labels });
    }
    const usersResponse = await fetch("/api/users", { cache: "no-store" });
    const payload = await usersResponse.json() as { users?: ManagedUser[]; error?: string };
    if (!usersResponse.ok) throw new Error(payload.error ?? "Unable to load accounts.");
    setUsers(payload.users ?? []);
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load team access."));
  }, []);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, email, role, temporaryPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create account.");
      setNotice(`Account created for ${name}. Share the temporary password directly with them.`);
      setName(""); setEmail(""); setRole("contributor"); setTemporaryPassword("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create account.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateAccountRole(user: ManagedUser, nextRole: AppRole) {
    if (nextRole === user.role) { setEditingAccessUserId(null); return; }
    const roleName = nextRole === "admin" ? "administrator" : "contributor";
    if (!window.confirm(`Change ${user.displayName}'s access to ${roleName}?`)) return;
    setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update access.");
      setNotice(`${user.displayName} is now a ${roleName}.`);
      setEditingAccessUserId(null);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update access.");
      await load();
    } finally {
      setIsSaving(false);
    }
  }

  async function resetAccountPassword(event: FormEvent<HTMLFormElement>, user: ManagedUser) {
    event.preventDefault();
    setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryPassword: resetPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to reset password.");
      setNotice(`Password reset for ${user.displayName}. Share the new temporary password directly with them.`);
      setResettingUserId(null); setResetPassword("");
      await load();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset password.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAccount(user: ManagedUser) {
    if (!window.confirm(`Remove ${user.displayName}'s access?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to remove account.");
      }
      setNotice("Account access removed.");
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove account.");
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to change password.");
      setCurrentPassword(""); setNewPassword("");
      setNotice("Your password has been changed.");
      await load();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to change password.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!session) return <main className="access-shell"><section className="access-card"><p className="heading-copy">Checking access...</p></section></main>;
  if (!session.configured || session.user?.role !== "admin") return <AccessGate configured={session.configured} />;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><span className="brand-divider" aria-hidden="true" /><span className="product-name">{labels.teamProductName}</span></div>
      <div className="topbar-actions"><SettingsMenu labels={labels} role="admin" showDashboard /></div>
    </header>
    <section className="team-workspace">
      <div className="page-heading"><div><p className="eyebrow">{labels.teamEyebrow}</p><h1>{labels.teamHeading}</h1><p className="heading-copy">{labels.teamCopy}</p></div></div>
      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error ? <div className="notice is-error" role="alert">{error}</div> : null}
      <section className="team-grid">
        <form className="team-invite-panel" onSubmit={createAccount}>
          <h2>{labels.teamAddMember}</h2>
          <label>{labels.teamFieldName}<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Team member name" /></label>
          <label>{labels.teamFieldEmail}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label>
          <label>{labels.teamFieldRole}<select value={role} onChange={(event) => setRole(event.target.value as AppRole)}><option value="contributor">{labels.teamRoleContributor}</option><option value="admin">{labels.teamRoleAdmin}</option></select></label>
          <label>{labels.teamFieldTempPassword}<input required type="text" minLength={12} value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="At least 12 characters" /></label>
          <button type="button" className="secondary-action" onClick={() => setTemporaryPassword(newTemporaryPassword())}>{labels.teamGeneratePassword}</button>
          <button className="primary-action" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : labels.teamCreateAccount}</button>
        </form>
        <section className="team-list-panel">
          <div className="panel-heading"><h2>{labels.teamAccounts}</h2><span className="table-note">{users.filter((user) => user.isActive).length} {labels.teamActive.toLowerCase()}</span></div>
          <div className="team-list">
            {users.length ? users.map((user) => {
              const isCurrentUser = user.id === session.user?.id;
              return <div className="team-member" key={user.id}>
                <div><strong>{user.displayName}</strong><span>{user.email}</span><small>{user.role === "admin" ? "Administrator" : "Contributor"} - Last sign-in {dateLabel(user.lastLoginAt)}</small></div>
                <div className="team-member-actions">
                  <span className={`access-status access-${user.isActive ? "active" : "revoked"}`}>{user.isActive ? labels.teamActive : labels.teamRemoved}</span>
                  {user.isActive && !isCurrentUser ? <>
                    {editingAccessUserId === user.id ? <div className="access-editor"><label className="role-control">{labels.teamFieldRole}<select value={editedRole} onChange={(event) => setEditedRole(event.target.value as AppRole)} disabled={isSaving}><option value="contributor">{labels.teamRoleContributor}</option><option value="admin">{labels.teamRoleAdmin}</option></select></label><div className="access-editor-actions"><button className="primary-action compact-action" type="button" onClick={() => void updateAccountRole(user, editedRole)} disabled={isSaving}>{labels.teamSaveAccess}</button><button className="secondary-action compact-action" type="button" onClick={() => setEditingAccessUserId(null)} disabled={isSaving}>{labels.teamCancel}</button></div></div> : <button className="secondary-action compact-action" type="button" onClick={() => { setEditingAccessUserId(user.id); setEditedRole(user.role); setResettingUserId(null); }}>{labels.teamEditAccess}</button>}
                    <button className="secondary-action compact-action" type="button" onClick={() => { setResettingUserId(user.id); setResetPassword(""); }}>{labels.teamResetPassword}</button>
                    <button className="delete-button" type="button" onClick={() => void removeAccount(user)}>{labels.teamRemove}</button>
                  </> : null}
                </div>
                {resettingUserId === user.id ? <form className="password-reset-form" onSubmit={(event) => void resetAccountPassword(event, user)}><label>New temporary password<input required minLength={12} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label><button type="button" className="secondary-action" onClick={() => setResetPassword(newTemporaryPassword())}>Generate</button><button type="submit" className="primary-action" disabled={isSaving}>Save password</button></form> : null}
              </div>;
            }) : <p className="empty-copy">{labels.teamEmpty}</p>}
          </div>
        </section>
      </section>
      <section className="password-panel"><div><p className="eyebrow">{labels.teamChangePasswordEyebrow}</p><h2>{labels.teamChangePasswordHeading}</h2></div><form className="password-change-form" onSubmit={changePassword}><label>{labels.teamCurrentPassword}<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>{labels.teamNewPassword}<input required type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><button className="primary-action" type="submit" disabled={isSaving}>{labels.teamChangePassword}</button></form></section>
    </section>
  </main>;
}
