"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, Database, FileClock, Gauge, LayoutDashboard, ListChecks, LogOut, Menu, Radio, Search, Settings, ShieldAlert, Users, X, BrainCircuit } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { Avatar, Badge, cn } from "@/components/ui/base";
import { PageLoader } from "@/components/ui/feedback";
import { Logo } from "@/components/shared/Logo";
import { BRAND } from "@/lib/brand";
import { api, tokens } from "@/lib/http";
import type { AdminAuth } from "@/lib/types";

interface AdminCtx {
  user: AdminAuth;
  isAdmin: boolean;
  pending: number;
  refreshPending: () => void;
  signOut: () => void;
}
const Ctx = createContext<AdminCtx | null>(null);
export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin must be used inside AdminShell");
  return c;
}

export const ADMIN_USER_KEY = "fds_admin_user";

const NAV = [
  { group: "Monitoring", items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/monitor", label: "Live monitor", icon: Radio },
  ] },
  { group: "Investigation", items: [
    { href: "/admin/transactions", label: "Transactions & cases", icon: ShieldAlert, badge: true },
    { href: "/admin/customers", label: "Customers", icon: Users },
  ] },
  { group: "Framework", items: [
    { href: "/admin/rules", label: "Rules engine", icon: ListChecks },
    { href: "/admin/model", label: "Model performance", icon: BrainCircuit },
  ] },
  { group: "Governance", items: [
    { href: "/admin/audit", label: "Audit log", icon: FileClock },
    { href: "/admin/database", label: "Database", icon: Database },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ] },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminAuth | null>(null);
  const [pending, setPending] = useState(0);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");

  const refreshPending = useCallback(async () => {
    try {
      const r = await api<{ total: number }>("admin", "/admin/transactions", { query: { status: "PendingReview", pageSize: 5 } });
      setPending(r.total);
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(() => {
    tokens.clear("admin");
    try { localStorage.removeItem(ADMIN_USER_KEY); } catch { /* ignore */ }
    router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    let u: AdminAuth | null = null;
    try { u = JSON.parse(localStorage.getItem(ADMIN_USER_KEY) ?? "null"); } catch { /* ignore */ }
    if (!tokens.get("admin") || !u) {
      tokens.clear("admin");
      router.replace("/admin/login");
      return;
    }
    setUser(u);
    refreshPending();
    const t = setInterval(refreshPending, 30000);
    return () => clearInterval(t);
  }, [router, refreshPending]);

  useEffect(() => setMenu(false), [pathname]);

  if (!user) return <div className="min-h-screen bg-bg"><PageLoader label="Opening the analyst portal..." /></div>;

  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  const sidebar = (
    <div className="flex h-full flex-col text-white" style={{ background: "linear-gradient(180deg,#1a0b3d 0%,#14184f 60%,#0f1d5c 100%)" }}>
      <div className="px-5 pb-4 pt-5"><Logo light subtitle="Fraud Operations" /></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = active(it.href, (it as { exact?: boolean }).exact);
                return (
                  <li key={it.href}>
                    <Link href={it.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", on ? "bg-white/15 text-white shadow-inner" : "text-white/70 hover:bg-white/10 hover:text-white")}>
                      <it.icon size={18} />
                      <span className="flex-1">{it.label}</span>
                      {(it as { badge?: boolean }).badge && pending > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-[#3b1275]">{pending}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
          <Avatar name={user.fullName} size={34} tone="blue" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="text-[11px] text-white/60">{user.role === "Admin" ? "Administrator" : "Fraud analyst"}</p>
          </div>
        </div>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"><LogOut size={17} /> Sign out</button>
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={{ user, isAdmin: user.role === "Admin", pending, refreshPending, signOut }}>
      <div className="min-h-screen bg-soft">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">{sidebar}</aside>
        <AnimatePresence>
          {menu && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
              <motion.aside className="absolute left-0 top-0 h-full w-[272px]" initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }} transition={{ type: "spring", stiffness: 340, damping: 34 }}>
                <button className="absolute right-3 top-4 z-10 rounded-lg p-1 text-white/80" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
                {sidebar}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <div className="lg:pl-[264px]">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
            <button className="rounded-xl border border-line p-2 text-ink2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={18} /></button>
            <form className="relative hidden max-w-md flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); router.push(`/admin/transactions?q=${encodeURIComponent(q)}`); }}>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a transaction by reference, customer or payee" className="h-10 w-full rounded-xl border border-line bg-soft pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10" />
            </form>
            <div className="flex-1 sm:hidden" />
            <div className="flex items-center gap-2.5">
              <span className="hidden items-center gap-1.5 text-xs text-muted md:flex"><span className="live-dot" /> Systems normal</span>
              <Badge tone={user.role === "Admin" ? "purple" : "blue"} icon={<Gauge size={12} />}>{user.role === "Admin" ? "Administrator" : "Analyst"}</Badge>
              <ThemeToggle />
              <button onClick={signOut} className="hidden rounded-xl border border-line p-2 text-ink2 hover:bg-dangersoft hover:text-danger sm:block" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
            <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>{children}</motion.div>
            <p className="mt-10 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted"><Activity size={12} /> {BRAND.analystName} · {BRAND.disclaimer}</p>
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
