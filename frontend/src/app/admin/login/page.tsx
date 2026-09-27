"use client";

import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_USER_KEY } from "@/components/admin/AdminShell";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/shared/Logo";
import { Alert } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/base";
import { BRAND } from "@/lib/brand";
import { ApiError, api, tokens } from "@/lib/http";
import type { AdminAuth } from "@/lib/types";

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let u: unknown = null;
    try { u = JSON.parse(localStorage.getItem(ADMIN_USER_KEY) ?? "null"); } catch { /* ignore */ }
    if (tokens.get("admin") && u) router.replace("/admin");
    else tokens.clear("admin");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<AdminAuth>("admin", "/auth/admin/login", { method: "POST", body: { username, password } });
      tokens.set("admin", res.token);
      try { localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res)); } catch { /* ignore */ }
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setLoading(false);
    }
  }

  return (
    <div className="hero-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-5">
      <div className="absolute right-5 top-5"><ThemeToggle className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" /></div>
      <Link href="/" className="absolute left-5 top-5 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"><ArrowLeft size={16} /> Home</Link>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo light subtitle="Fraud Operations Portal" /></div>
        <div className="rounded-3xl border border-line bg-surface p-7 shadow-pop">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brandsoft text-brand"><ShieldCheck size={22} /></div>
            <div><h1 className="text-lg font-semibold text-ink">Analyst sign-in</h1><p className="text-xs text-muted">Authorised fraud operations staff only</p></div>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Username"><Input icon={<User size={16} />} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></Field>
            <Field label="Password"><Input icon={<KeyRound size={16} />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" size="lg" loading={loading} className="w-full">Sign in</Button>
          </form>

          <div className="mt-6 rounded-2xl border border-line bg-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Demo accounts (password <code className="rounded bg-surface2 px-1">admin123</code>)</p>
            <div className="mt-2 grid gap-1.5">
              {[["analyst", "Fraud analyst: review and decide cases"], ["admin", "Administrator: also edits rules, settings and the database"]].map(([u, d]) => (
                <button key={u} type="button" onClick={() => { setUsername(u); setPassword("admin123"); }} className="flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-brandsoft">
                  <span><span className="block text-sm font-medium text-ink">{u}</span><span className="block text-xs text-muted">{d}</span></span>
                  <span className="text-xs font-medium text-brand">Use</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-white/70">{BRAND.disclaimer}</p>
      </motion.div>
    </div>
  );
}
