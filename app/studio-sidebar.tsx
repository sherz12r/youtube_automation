"use client";

import { signOut, type SessionUser } from "./auth-client";
import Link from "next/link";

export const studioNavigation = [
  { id: "overview", icon: "⌂", en: "Overview", ur: "جائزہ" },
  { id: "stories", icon: "▤", en: "Story queue", ur: "کہانیوں کی فہرست" },
  { id: "sources", icon: "◇", en: "Source library", ur: "مآخذ کی لائبریری" },
  { id: "studio", icon: "▶", en: "Video studio", ur: "ویڈیو اسٹوڈیو" },
  { id: "publishing", icon: "↗", en: "Publishing", ur: "اشاعت" },
] as const;

type Props = {
  user: SessionUser;
  active: string;
  language?: "ur" | "en";
  reviewCount?: number;
  onNavigate?: (tab: string) => void;
};

export default function StudioSidebar({ user, active, language = "en", reviewCount = 0, onNavigate }: Props) {
  const t = (english: string, urdu: string) => language === "en" ? english : urdu;
  return <aside className="sidebar">
    <Link className="brand" href="/" aria-label={t("Noor Studio home", "نور اسٹوڈیو ہوم")}>
      <span className="brand-mark">ن</span>
      <div><strong>{t("Noor Studio", "نور اسٹوڈیو")}</strong><small>{t("Stories with purpose", "بامقصد کہانیاں")}</small></div>
    </Link>
    <nav aria-label={t("Main navigation", "مرکزی مینو")}>
      {studioNavigation.map(item => onNavigate
        ? <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}><span>{item.icon}</span>{language === "en" ? item.en : item.ur}{item.id === "stories" && <b>{reviewCount}</b>}</button>
        : <Link key={item.id} className={active === item.id ? "active" : ""} href={`/?tab=${item.id}`}><span>{item.icon}</span>{language === "en" ? item.en : item.ur}{item.id === "stories" && reviewCount > 0 && <b>{reviewCount}</b>}</Link>)}
    </nav>
    <div className="sidebar-bottom">
      <Link className={active === "settings" ? "active" : ""} href="/settings"><span>⚙</span>{t("Channel settings", "چینل کی ترتیبات")}</Link>
      {user.role === "admin" && <Link className={active === "admin" ? "active" : ""} href="/admin"><span>◇</span>{t("Manage customers", "صارفین کا انتظام")}</Link>}
      <div className="profile"><span>{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === "admin" ? t("Main administrator", "مرکزی منتظم") : t("Channel owner", "چینل کا مالک")}</small></div><button className="profile-signout" aria-label="Sign out" onClick={() => void signOut()}>↗</button></div>
    </div>
  </aside>;
}
