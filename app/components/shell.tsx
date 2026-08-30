"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/app/components/sidebar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ultron.sidebar.collapsed";

/**
 * AppShell owns the sidebar's responsive layout state:
 *  - Desktop (md+): the sidebar is a fixed rail that can be collapsed to
 *    icon-only (memorized in localStorage) or expanded.
 *  - Mobile (<md): the sidebar is hidden off-canvas; a hamburger in a small
 *    top bar opens it as a slide-over drawer with a backing overlay.
 *
 * It renders <main> so its left padding can react to the sidebar state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const toggleCollapse = () => setCollapsed((c) => !c);

  // Restore the persisted desktop collapse preference once available.
  useEffect(() => {
    const id = window.setTimeout(() => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (stored === "1") setCollapsed(true);
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Persist desktop collapse preference.
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, mounted]);

  // Close the mobile drawer when the viewport grows to desktop.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return (
    <div className="relative min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Mobile top bar — hamburger to open the drawer */}
      <div className="fixed left-0 top-0 z-40 flex items-center pl-3 pt-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="glass flex h-9 w-9 items-center justify-center rounded-xl text-ink transition hover:bg-surface-2"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      </div>

      <main
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-300 ease-out",
          "pl-0 md:pl-[72px]",
          !collapsed && "md:pl-[260px]",
        )}
      >
        {children}
      </main>
    </div>
  );
}
