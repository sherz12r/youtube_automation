"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../auth-client";
import StudioSidebar from "../studio-sidebar";

type Profile = {
  channelName: string;
  channelTopic: string;
  targetAudience: string;
  contentLanguage: string;
  contentTone: string;
  uploadPrivacy: "private" | "unlisted" | "public";
  postingSchedule: string;
  youtubeChannelId: string;
  youtubeConnected: boolean;
  updatedAt: number;
};

const blank: Profile = {
  channelName: "", channelTopic: "", targetAudience: "", contentLanguage: "English",
  contentTone: "Educational and engaging", uploadPrivacy: "private", postingSchedule: "3 videos per week",
  youtubeChannelId: "", youtubeConnected: false, updatedAt: 0,
};

export default function SettingsPage() {
  const { user, loading } = useSession();
  const [profile, setProfile] = useState(blank);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const youtube = params.get("youtube");
    queueMicrotask(() => {
      if (youtube === "connected") setNotice("YouTube connected successfully. You can now upload videos from the studio.");
      if (youtube === "error") setError(params.get("message") || "YouTube could not be connected.");
    });
    if (youtube) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/account/channel", { cache: "no-store" }).then(async response => {
      const result = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok) throw new Error(result.error);
      setProfile(result.profile || blank);
    }).catch(cause => setError(cause instanceof Error ? cause.message : "Settings could not be loaded."));
  }, [user]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/account/channel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, ...(token ? { youtubeRefreshToken: token } : {}) }),
      });
      const result = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok) throw new Error(result.error || "Settings could not be saved.");
      setProfile(result.profile || profile);
      setToken("");
      setNotice("Channel settings saved. New content will follow this profile.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settings could not be saved.");
    } finally { setSaving(false); }
  }

  async function disconnect() {
    setError("");
    const response = await fetch("/api/account/channel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, disconnectYoutube: true }),
    });
    const result = await response.json() as { profile?: Profile; error?: string };
    if (response.ok && result.profile) {
      setProfile(result.profile);
      setNotice("YouTube authorization removed.");
    } else setError(result.error || "YouTube could not be disconnected.");
  }

  if (loading) return <main className="portal-loading">Loading channel settings…</main>;
  if (!user) return <main className="portal-loading">Please <Link href="/login">sign in</Link>.</main>;
  return <main className="app-shell">
    <StudioSidebar user={user} active="settings" />
    <section className="workspace portal-content settings-content">
      <header><div><span>CHANNEL PROFILE</span><h1>Teach the studio your style</h1><p>These preferences guide every new topic, script, visual, and upload.</p></div><Link href="/">Back to studio</Link></header>
      {error && <div className="portal-alert error">{error}<button onClick={() => setError("")}>×</button></div>}
      {notice && <div className="portal-alert">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      <form className="settings-form" onSubmit={save}>
        <section className="admin-panel">
          <div className="panel-heading"><div><span>01</span><h2>Channel identity</h2><p>Describe the channel this workspace will create for.</p></div></div>
          <div className="form-grid">
            <label><span>Channel name</span><input value={profile.channelName} onChange={event => setProfile({ ...profile, channelName: event.target.value })} placeholder="e.g. Clear Mind Finance" /></label>
            <label><span>Primary language</span><input value={profile.contentLanguage} onChange={event => setProfile({ ...profile, contentLanguage: event.target.value })} placeholder="English, Urdu, Arabic…" /></label>
            <label className="wide"><span>Channel topic / niche</span><textarea rows={3} value={profile.channelTopic} onChange={event => setProfile({ ...profile, channelTopic: event.target.value })} placeholder="What does your channel help viewers understand or achieve?" /></label>
            <label className="wide"><span>Target audience</span><textarea rows={2} value={profile.targetAudience} onChange={event => setProfile({ ...profile, targetAudience: event.target.value })} placeholder="Who watches, and what do they already know?" /></label>
            <label><span>Content tone</span><input value={profile.contentTone} onChange={event => setProfile({ ...profile, contentTone: event.target.value })} placeholder="Warm, authoritative, fast-paced…" /></label>
            <label><span>Publishing rhythm</span><input value={profile.postingSchedule} onChange={event => setProfile({ ...profile, postingSchedule: event.target.value })} placeholder="3 videos per week" /></label>
          </div>
        </section>
        <section className="admin-panel youtube-settings">
          <div className="panel-heading"><div><span>02</span><h2>YouTube connection</h2><p>Connect Google securely. The refresh token is encrypted and never displayed.</p></div><i className={profile.youtubeConnected ? "connected" : ""}>{profile.youtubeConnected ? "● Connected" : "○ Not connected"}</i></div>
          <div className="youtube-connect-row"><div><strong>{profile.youtubeConnected ? "Reconnect or change channel" : "Authorize your YouTube channel"}</strong><small>Google will ask for permission to upload videos. Each account connects only its own channel.</small></div><a href="/api/youtube/oauth/start">{profile.youtubeConnected ? "Reconnect YouTube" : "Connect YouTube"}</a></div>
          <div className="form-grid">
            <label><span>YouTube channel ID</span><input value={profile.youtubeChannelId} onChange={event => setProfile({ ...profile, youtubeChannelId: event.target.value })} placeholder="UC…" /></label>
            <label><span>Default upload privacy</span><select value={profile.uploadPrivacy} onChange={event => setProfile({ ...profile, uploadPrivacy: event.target.value as Profile["uploadPrivacy"] })}><option value="private">Private — safest for review</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
            <label className="wide"><span>{profile.youtubeConnected ? "Replace refresh token manually (optional)" : "Refresh token (manual fallback)"}</span><input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Use Connect YouTube above, or paste a refresh token" /><small>Manual entry is only a fallback. The Google connection button is recommended.</small></label>
          </div>
          {profile.youtubeConnected && <button type="button" className="danger-button" onClick={() => void disconnect()}>Disconnect YouTube</button>}
        </section>
        <div className="settings-save"><span>Changes apply to newly generated content.</span><button disabled={saving}>{saving ? "Saving…" : "Save channel settings"}</button></div>
      </form>
    </section>
  </main>;
}
