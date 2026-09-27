"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Banknote, CreditCard, Gift, HandCoins, LayoutDashboard, LifeBuoy, ListOrdered, LogOut, Menu, PieChart, Receipt, Search, Send, ShieldCheck, UserCircle, Users, X, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { Avatar, Badge, Button, cn } from "@/components/ui/base";
import { PageLoader } from "@/components/ui/feedback";
import { Logo } from "@/components/shared/Logo";
import { SimulationProvider } from "./simulation";
import { PROMOS } from "@/lib/promos";
import { api, tokens } from "@/lib/http";
import { naira, timeAgo } from "@/lib/format";
import type { CustomerProfile } from "@/lib/types";

interface BankCtx {
  profile: CustomerProfile;
  refresh: () => Promise<void>;
  unread: number;
  refreshUnread: () => Promise<void>;
  signOut: () => void;
}
const Ctx = createContext<BankCtx | null>(null);
export function useBank() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBank must be used inside BankShell");
  return c;
}

const NAV: { group: string; items: { href: string; label: string; icon: typeof Send; exact?: boolean }[] }[] = [
  { group: "Overview", items: [{ href: "/bank", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    group: "Payments",
    items: [
      { href: "/bank/transfer", label: "Transfer money", icon: Send },
      { href: "/bank/bills", label: "Pay bills", icon: Receipt },
      { href: "/bank/cards", label: "Card payments", icon: CreditCard },
      { href: "/bank/atm", label: "ATM withdrawal", icon: Banknote },
      { href: "/bank/collect", label: "Request money", icon: HandCoins },
    ],
  },
  {
    group: "Manage",
    items: [
      { href: "/bank/beneficiaries", label: "Beneficiaries", icon: Users },
      { href: "/bank/transactions", label: "Transactions", icon: ListOrdered },
      { href: "/bank/insights", label: "Spending insights", icon: PieChart },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/bank/security", label: "Security centre", icon: ShieldCheck },
      { href: "/bank/profile", label: "Profile & KYC", icon: UserCircle },
      { href: "/bank/notifications", label: "Notifications", icon: Bell },
      { href: "/bank/offers", label: "Offers", icon: Gift },
      { href: "/bank/help", label: "Help & fraud protection", icon: LifeBuoy },
    ],
  },
];

export function BankShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    setProfile(await api<CustomerProfile>("bank", "/bank/me"));
  }, []);
  const refreshUnread = useCallback(async () => {
    try {
      const n = await api<{ unread: number }>("bank", "/bank/notifications");
      setUnread(n.unread);
    } catch {
      /* ignore */
    }
  }, []);
  const signOut = useCallback(() => {
    tokens.clear("bank");
    router.replace("/bank/login");
  }, [router]);

  useEffect(() => {
    if (!tokens.get("bank")) {
      router.replace("/bank/login");
      return;
    }
    refresh().catch(() => {});
    refreshUnread();
  }, [refresh, refreshUnread, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (!profile) return <div className="min-h-screen bg-bg"><PageLoader label="Opening your account..." /></div>;

  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  const primary = profile.accounts[0];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = active(it.href, it.exact);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                        on ? "bg-brand-gradient text-white shadow-card" : "text-ink2 hover:bg-brandsoft hover:text-brand",
                      )}
                    >
                      <it.icon size={18} className={on ? "text-white" : "text-muted group-hover:text-brand"} />
                      <span className="flex-1">{it.label}</span>
                      {it.href === "/bank/notifications" && unread > 0 && (
                        <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", on ? "bg-white/25 text-white" : "bg-danger text-white")}>{unread}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="rounded-2xl bg-brand-gradient p-4 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/70">Available balance</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{naira(profile.accounts.reduce((a, b) => a + b.balance, 0))}</p>
          <p className="mt-1 text-[11px] text-white/70">
            {primary?.type} ••••{primary?.accountNumber.slice(-4)}
          </p>
        </div>
        <button onClick={signOut} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink2 hover:bg-dangersoft hover:text-danger">
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={{ profile, refresh, unread, refreshUnread, signOut }}>
      <SimulationProvider>
        <div className="min-h-screen bg-soft">
          {/* desktop sidebar */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-line bg-surface lg:block">{sidebar}</aside>

          {/* mobile drawer */}
          <AnimatePresence>
            {menuOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <motion.div className="absolute inset-0 bg-[#0b0a1e]/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
                <motion.aside className="absolute left-0 top-0 h-full w-[280px] bg-surface shadow-pop" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", stiffness: 340, damping: 34 }}>
                  <button className="absolute right-3 top-4 rounded-lg p-1 text-muted hover:bg-surface2" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                    <X size={18} />
                  </button>
                  {sidebar}
                </motion.aside>
              </div>
            )}
          </AnimatePresence>

          <div className="lg:pl-[272px]">
            <TopBar profile={profile} unread={unread} onMenu={() => setMenuOpen(true)} onRead={refreshUnread} signOut={signOut} />
            <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
              <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
                {children}
              </motion.div>
            </main>
          </div>
          <PromoPopup />
        </div>
      </SimulationProvider>
    </Ctx.Provider>
  );
}

function TopBar({ profile, unread, onMenu, onRead, signOut }: { profile: CustomerProfile; unread: number; onMenu: () => void; onRead: () => void; signOut: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const [items, setItems] = useState<{ id: number; kind: string; title: string; body: string; read: boolean; createdAt: string; transactionId: number | null }[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setBell(false);
        setMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const openBell = async () => {
    setMenu(false);
    setBell(!bell);
    if (!bell) {
      const n = await api<{ items: typeof items }>("bank", "/bank/notifications");
      setItems(n.items.slice(0, 6));
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button className="rounded-xl border border-line p-2 text-ink2 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <form
        className="relative hidden max-w-md flex-1 sm:block"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/bank/transactions?q=${encodeURIComponent(q)}`);
        }}
      >
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions by name or reference" className="h-10 w-full rounded-xl border border-line bg-soft pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10" />
      </form>
      <div className="flex-1 sm:hidden" />

      <div ref={box} className="flex items-center gap-2">
        <ThemeToggle />
        <div className="relative">
          <button onClick={openBell} className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink2 hover:bg-surface2 hover:text-brand" aria-label="Notifications">
            <Bell size={17} />
            {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread}</span>}
          </button>
          <AnimatePresence>
            {bell && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} className="absolute right-0 top-12 z-40 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                  <button
                    className="text-xs font-medium text-brand hover:underline"
                    onClick={async () => {
                      await api("bank", "/bank/notifications/read-all", { method: "POST" });
                      setItems((s) => s.map((i) => ({ ...i, read: true })));
                      onRead();
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                <ul className="max-h-80 overflow-y-auto">
                  {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You are all caught up.</li>}
                  {items.map((n) => (
                    <li key={n.id} className={cn("border-b border-line/60 px-4 py-3 last:border-b-0", !n.read && "bg-brandsoft/50")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-ink">{n.title}</p>
                        <Badge tone={n.kind === "Security" ? "warn" : n.kind === "Promo" ? "purple" : "blue"}>{n.kind}</Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                      <p className="mt-1 text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
                <Link href="/bank/notifications" onClick={() => setBell(false)} className="flex items-center justify-center gap-1 border-t border-line px-4 py-2.5 text-xs font-medium text-brand hover:bg-brandsoft">
                  View all <ChevronRight size={13} />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button onClick={() => { setBell(false); setMenu(!menu); }} className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1 pl-1 pr-3 hover:bg-surface2">
            <Avatar name={profile.fullName} size={30} />
            <span className="hidden text-sm font-medium text-ink sm:block">{profile.fullName.split(" ")[0]}</span>
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-semibold text-ink">{profile.fullName}</p>
                  <p className="truncate text-xs text-muted">{profile.email}</p>
                </div>
                <div className="p-1.5 text-sm">
                  <Link href="/bank/profile" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-ink2 hover:bg-brandsoft hover:text-brand"><UserCircle size={16} /> Profile & KYC</Link>
                  <Link href="/bank/security" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-ink2 hover:bg-brandsoft hover:text-brand"><ShieldCheck size={16} /> Security centre</Link>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ink2 hover:bg-dangersoft hover:text-danger"><LogOut size={16} /> Sign out</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

// Welcome advert, once per browser session.
function PromoPopup() {
  const [open, setOpen] = useState(false);
  const [idx] = useState(() => Math.floor(Math.random() * PROMOS.length));
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStorage.getItem("fds_promo_seen")) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), 2800);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem("fds_promo_seen", "1");
    } catch {
      /* ignore */
    }
  };
  const p = PROMOS[idx];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <motion.div className="absolute inset-0 bg-[#0b0a1e]/55 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-pop">
            <div className="relative px-6 pb-6 pt-8 text-white" style={{ background: p.gradient }}>
              <button onClick={close} className="absolute right-3 top-3 rounded-lg p-1.5 text-white/80 hover:bg-white/15" aria-label="Close advert">
                <X size={18} />
              </button>
              <motion.div initial={{ rotate: -12, scale: 0.7 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.15, type: "spring" }} className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <p.icon size={28} />
              </motion.div>
              <Badge tone="neutral" className="border-white/30 bg-white/15 text-white">{p.badge}</Badge>
              <h3 className="mt-3 text-2xl font-semibold leading-tight">{p.title}</h3>
              <p className="mt-2 text-sm text-white/85">{p.body}</p>
            </div>
            <div className="flex items-center justify-between gap-3 p-5">
              <button onClick={close} className="text-sm font-medium text-muted hover:text-ink">Maybe later</button>
              <Button onClick={() => { close(); router.push(p.href); }}>{p.cta}</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
