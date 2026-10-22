"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("The sign-in service is temporarily unavailable. Restart the application and try again.");
      }
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="auth-home" href="/">
        <span>NS</span>
        <strong>Noor Studio</strong>
      </Link>
      <section className="auth-card">
        <div className="auth-intro">
          <span>WELCOME BACK</span>
          <h1>Sign in to your studio</h1>
          <p>Continue building, reviewing, and publishing videos for your channel.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={7} placeholder="Your secure password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in securely"}<span>→</span>
          </button>
        </form>
        <small>Accounts and subscriptions are created by your Noor Studio administrator.</small>
      </section>
      <div className="auth-side">
        <span className="auth-orb">✦</span>
        <blockquote>“A calm, focused workspace for turning one channel idea into a consistent publishing system.”</blockquote>
        <div><b>Tenant-isolated</b><b>Encrypted credentials</b><b>Human approval</b></div>
      </div>
    </main>
  );
}
