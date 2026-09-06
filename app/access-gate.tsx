"use client";

import type { FormEvent } from "react";
import { useState } from "react";

export function AccessGate({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to sign in.");
      window.location.assign("/");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="access-shell"><section className="access-card"><img src="/rosetta-logo-horizontal.png" alt="Rosetta Languages" /><p className="eyebrow">Sales performance</p><h1>{configured ? "Team sign in" : "Access setup in progress"}</h1>{configured ? <form className="login-form" onSubmit={signIn}><label>Business email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-action access-action" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : "Sign in"}</button></form> : <p className="heading-copy">This protected dashboard is being prepared for individual Rosetta team accounts.</p>}</section></main>;
}
