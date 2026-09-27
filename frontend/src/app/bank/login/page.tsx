"use client";

import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/shared/Logo";
import { Alert } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/base";
import { BRAND } from "@/lib/brand";
import { ApiError, api, tokens } from "@/lib/http";
import type { AuthResponse } from "@/lib/types";

const DEMO = [
  { email: "adaeze@example.com", name: "Adaeze Okafor", note: "Everyday customer with 90 days of history" },
  { email: "chiamaka@example.com", name: "Chiamaka Eze", note: "Premium: high balance, higher thresholds" },
  { email: "femi@example.com", name: "Femi Adeyemi", note: "Student: very low amount thresholds" },
  { email: "ngozi@example.com", name: "Ngozi Umeh", note: "Dormant for 130 days: try a large transfer" },
  { email: "emeka@example.com", name: "Emeka Nwosu", note: "Traveller with a UK travel notice on file" },
  { email: "zainab@example.com", name: "Zainab Bello", note: "Brand-new account, KYC mismatch" },
  { email: "ibrahim@example.com", name: "Ibrahim Musa", note: "KYC pending, shares a phone number" },
];

export default function BankLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tokens.get("bank")) router.replace("/bank");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<AuthResponse>("bank", "/auth/customer/login", { method: "POST", body: { email, password } });
      tokens.set("bank", res.token);
      router.replace("/bank");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <div className="hero-mesh relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"><ArrowLeft size={16} /> Back to home</Link>
        <div>
          <Logo light />
          <h1 className="mt-10 text-4xl font-semibold leading-tight tracking-tight">{BRAND.tagline}.</h1>
          <p className="mt-4 max-w-md text-white/80">Every payment you make is checked by our fraud protection before it leaves your account.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              [ShieldCheck, "Real-time fraud screening on every payment"],
              [Lock, "Sensitive details encrypted with PGP"],
              [Sparkles, "Fast, modern banking for payments, bills and cards"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Lock;
              return (
                <motion.li key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><I size={17} /></span>
                  {text as string}
                </motion.li>
              );
            })}
          </ul>
        </div>
        <p className="text-xs text-white/60">{BRAND.disclaimer}</p>
      </div>

      {/* form */}
      <div className="flex flex-col bg-bg">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <div className="lg:hidden"><Logo /></div>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h2>
            <p className="mt-1 text-sm text-muted">Sign in to your {BRAND.full} internet banking.</p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <Field label="Email address">
                <Input icon={<Mail size={16} />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" required />
              </Field>
              <Field label="Password">
                <Input icon={<KeyRound size={16} />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required />
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" size="lg" loading={loading} className="w-full">Sign in</Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted">
              New to {BRAND.name}? <Link href="/bank/register" className="font-semibold text-brand hover:underline">Open an account</Link>
            </p>

            {/* demo accounts */}
            <div className="mt-8 rounded-2xl border border-line bg-soft p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Demo customers · password <code className="rounded bg-surface2 px-1">password123</code> · PIN <code className="rounded bg-surface2 px-1">1234</code></p>
              <div className="mt-3 grid gap-1.5">
                {DEMO.map((d) => (
                  <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword("password123"); }} className="flex items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-brandsoft">
                    <span>
                      <span className="block text-sm font-medium text-ink">{d.name}</span>
                      <span className="block text-xs text-muted">{d.note}</span>
                    </span>
                    <span className="text-xs font-medium text-brand">Use</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-muted">
              Are you a fraud analyst? <Link href="/admin/login" className="font-medium text-brand2 hover:underline">Go to the analyst portal</Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
