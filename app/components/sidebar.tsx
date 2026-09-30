"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Database,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearCache, readCache, writeCache } from "@/lib/client-cache";

interface SessionRow {
  id: string;
  title: string;
  updatedAt: number | string | Date;
  messageCount: number;
}

/** How long a fetched session list is reused before it is refetched. */
const SESSION_CACHE_TTL_MS = 60_000;
/** After a quota 503, stop asking for this long instead of hammering. */
const QUOTA_BACKOFF_MS = 5 * 60_000;

const NAV = [
  { href: "/", icon: MessageSquare, label: "Chat" },
  { href: "/memory", icon: Database, label: "Memory" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/system", icon: Activity, label: "System" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Seeded once, synchronously, from the cache — a reload normally shows the
  // recent list with zero reads at all.
  const [cachedSeed] = useState<SessionRow[] | null>(() =>
    typeof window === "undefined"
      ? null
      : readCache<SessionRow[]>("sessions", SESSION_CACHE_TTL_MS),
  );
  const [sessions, setSessions] = useState<SessionRow[]>(cachedSeed ?? []);
  /** Set while the store is quota-blocked, so we can explain and back off. */
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const backoffUntilRef = useRef(0);

  /**
   * The session list is a billed Firestore read, so it is served from a short
   * sessionStorage cache and only refetched when that expires, when the window
   * regains focus, or when a session is created or deleted (`force`). While the
   * backend is quota-blocked we stop asking entirely.
   */
  const loadSessions = useCallback((force = false) => {
    if (Date.now() < backoffUntilRef.current) return;

    if (!force) {
      const cached = readCache<SessionRow[]>("sessions", SESSION_CACHE_TTL_MS);
      if (cached) return; // still fresh — nothing to read
    }

    fetch("/api/sessions")
      .then(async (res) => {
        if (res.status === 503) {
          // Storage quota exhausted: wait it out instead of retrying.
          backoffUntilRef.current = Date.now() + QUOTA_BACKOFF_MS;
          setQuotaBlocked(true);
          return null;
        }
        setQuotaBlocked(false);
        return res.ok ? ((await res.json()) as { sessions?: SessionRow[] }) : null;
      })
      .then((data) => {
        if (!data) return;
        const list = data.sessions ?? [];
        setSessions(list);
        writeCache("sessions", list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // The cache was seeded above; only read the store when it was missing.
    if (cachedSeed?.length) return;
    loadSessions(true);
  }, [cachedSeed, loadSessions]);

  // Refresh when the tab comes back or is re-shown (cache may have gone stale),
  // and force a read when a session is created or deleted. No timer: a poll
  // loop is what drained the quota before.
  useEffect(() => {
    const onFocus = () => loadSessions();
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadSessions();
    };
    const onChanged = () => loadSessions(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("ultron:sessions", onChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ultron:sessions", onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadSessions]);

  const remove = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
    clearCache("sessions");
    loadSessions(true);
  };

  const nav = (href: string) => {
    router.push(href);
    onCloseMobile();
  };

  return (
    <>
      {/* Desktop rail: fixed, collapses to icon-only */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface/40 backdrop-blur-xl transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        {/* Header / logo */}
        <div
          className={cn(
            "flex items-center pt-5 pb-4",
            collapsed ? "justify-center" : "gap-3 px-5",
          )}
        >
          <div className="core-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-lg shadow-brand/30">
            <Sparkles size={20} />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight text-ink">
                Ultron
              </div>
              <div className="text-xs text-mist">Personal agentic assistant</div>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <div className="px-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-surface-2 hover:text-ink",
              !collapsed && "ml-auto",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        {/* New conversation */}
        <div className="mt-2 px-3">
          <button
            onClick={() => nav("/")}
            title={collapsed ? "New conversation" : undefined}
            className={cn(
              "glass flex items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium text-ink transition hover:border-border-strong hover:bg-surface-2",
              collapsed ? "h-11 w-11" : "w-full",
            )}
          >
            <Plus size={16} className="shrink-0 text-brand-bright" />
            {!collapsed && "New conversation"}
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-4 flex flex-col gap-1 px-3">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition",
                  collapsed && "justify-center",
                  active
                    ? "bg-surface-2 font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-border)]"
                    : "text-mist hover:bg-surface-2/60 hover:text-ink",
                )}
              >
                <Icon
                  size={17}
                  className={cn("shrink-0", active ? "text-brand-bright" : "")}
                />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* Recent sessions — hidden entirely when the rail is collapsed */}
        {!collapsed && (
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-border pt-3">
            <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-mist">
              Recent sessions
            </div>

            {sessions.length === 0 ? (
              <div className="px-4 py-2 text-xs text-mist">
                {quotaBlocked
                  ? "Session list unavailable — storage quota reached."
                  : "No conversations yet."}
              </div>
            ) : (
              <div className="px-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-surface-2/60"
                  >
                    <Link
                      href={`/?s=${s.id}`}
                      onClick={onCloseMobile}
                      className="min-w-0 flex-1 truncate text-[13px] text-graphite transition group-hover:text-ink"
                      title={s.title}
                    >
                      {s.title || "New conversation"}
                    </Link>
                    <button
                      onClick={(e) => remove(e, s.id)}
                      className="text-mist opacity-0 transition hover:text-bad group-hover:opacity-100"
                      aria-label="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {quotaBlocked && (
                  <div className="px-4 pt-2 text-[11px] text-mist">
                    Storage quota reached — this list may be out of date.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collapsed: flex spacer keeps the status footer pinned to the bottom */}
        {collapsed && <div className="min-h-0 flex-1" />}

        <div className="border-t border-border py-3">
          <div
            className={cn(
              "flex items-center gap-2 text-xs text-mist",
              collapsed ? "justify-center" : "px-5",
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand shadow-[0_0_8px_var(--color-brand)]" />
            {!collapsed && "Ultron · online"}
          </div>
        </div>
      </aside>

      {/* Mobile drawer: off-canvas, slides in when open */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-surface/95 backdrop-blur-xl transition-transform duration-300 ease-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className="core-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-lg shadow-brand/30">
            <Sparkles size={20} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-ink">
              Ultron
            </div>
            <div className="text-xs text-mist">Personal agentic assistant</div>
          </div>
        </div>

        <div className="px-3">
          <button
            onClick={() => nav("/")}
            className="glass flex w-full items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium text-ink transition hover:border-border-strong hover:bg-surface-2"
          >
            <Plus size={16} className="text-brand-bright" />
            New conversation
          </button>
        </div>

        <nav className="mt-4 flex flex-col gap-1 px-3">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition",
                  active
                    ? "bg-surface-2 font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-border)]"
                    : "text-mist hover:bg-surface-2/60 hover:text-ink",
                )}
              >
                <Icon size={17} className={active ? "text-brand-bright" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-border px-3 pt-3">
          <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-mist">
            Recent sessions
          </div>
          {sessions.length === 0 ? (
            <div className="px-1 py-2 text-xs text-mist">No conversations yet.</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-surface-2/60"
              >
                <Link
                  href={`/?s=${s.id}`}
                  onClick={onCloseMobile}
                  className="min-w-0 flex-1 truncate text-[13px] text-graphite transition group-hover:text-ink"
                  title={s.title}
                >
                  {s.title || "New conversation"}
                </Link>
                <button
                  onClick={(e) => remove(e, s.id)}
                  className="text-mist opacity-0 transition hover:text-bad group-hover:opacity-100"
                  aria-label="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-mist">
            <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_8px_var(--color-brand)]" />
            Ultron · online
          </div>
        </div>
      </aside>
    </>
  );
}
