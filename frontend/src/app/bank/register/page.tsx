"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Home, IdCard, KeyRound, Lock, Mail, Phone, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/shared/Logo";
import { Alert } from "@/components/ui/feedback";
import { Button, Field, Input, Select, cn } from "@/components/ui/base";
import { PinInput } from "@/components/ui/pin";
import { BRAND } from "@/lib/brand";
import { ApiError, api, tokens } from "@/lib/http";
import type { AuthResponse } from "@/lib/types";

const STEPS = ["Your details", "Verify identity", "Secure your account"];

export default function Register() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AuthResponse | null>(null);
  const [f, setF] = useState({ fullName: "", email: "", phone: "", address: "", nameOnId: "", bvn: "", password: "", confirm: "", pin: "", accountType: "Savings" });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  function validate(): string | null {
    if (step === 0) {
      if (f.fullName.trim().length < 3) return "Enter your full name.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return "Enter a valid email address.";
      if (!/^\+?\d{10,14}$/.test(f.phone.replace(/[\s-]/g, ""))) return "Enter a valid phone number (10 to 14 digits).";
      if (f.address.trim().length < 6) return "Enter your residential address.";
    }
    if (step === 1) {
      if (f.bvn && f.bvn.replace(/\D/g, "").length !== 11) return "A BVN has 11 digits. Leave it empty to verify later.";
    }
    if (step === 2) {
      if (f.password.length < 8) return "Password must be at least 8 characters.";
      if (f.password !== f.confirm) return "The two passwords do not match.";
      if (!/^\d{4}$/.test(f.pin)) return "Choose a 4-digit transaction PIN.";
    }
    return null;
  }

  async function next() {
    const v = validate();
    setError(v);
    if (v) return;
    if (step < 2) return setStep(step + 1);

    setLoading(true);
    try {
      const res = await api<AuthResponse>("bank", "/auth/register", {
        method: "POST",
        body: { fullName: f.fullName, email: f.email, phone: f.phone, password: f.password, pin: f.pin, address: f.address, nameOnId: f.nameOnId || undefined, bvn: f.bvn || undefined, accountType: f.accountType },
      });
      tokens.set("bank", res.token);
      setDone(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const acct = done.profile.accounts[0];
    return (
      <div className="flex min-h-screen items-center justify-center bg-soft p-5">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface text-center shadow-pop">
          <div className="hero-mesh px-8 py-10 text-white">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20"><BadgeCheck size={34} /></motion.div>
            <h1 className="mt-5 text-2xl font-semibold">Welcome to {BRAND.name}, {done.profile.fullName.split(" ")[0]}!</h1>
            <p className="mt-2 text-sm text-white/80">Your account is open and ready to use.</p>
          </div>
          <div className="space-y-3 p-6 text-left text-sm">
            <div className="flex justify-between rounded-xl bg-soft px-4 py-3"><span className="text-muted">Account number</span><span className="font-mono font-semibold text-ink">{acct.accountNumber}</span></div>
            <div className="flex justify-between rounded-xl bg-soft px-4 py-3"><span className="text-muted">Account type</span><span className="font-medium text-ink">{acct.type}</span></div>
            <div className="flex justify-between rounded-xl bg-soft px-4 py-3"><span className="text-muted">Welcome bonus (demo)</span><span className="font-semibold text-success">₦250,000</span></div>
            <div className="flex justify-between rounded-xl bg-soft px-4 py-3"><span className="text-muted">Identity check (KYC)</span><span className={cn("font-medium", done.profile.kyc === "Verified" ? "text-success" : "text-warn")}>{done.profile.kyc}</span></div>
            {done.profile.kyc !== "Verified" && <Alert tone="warn">Your identity check is not complete. Payments from unverified accounts may be reviewed more closely.</Alert>}
            <Alert tone="info">Everything you enter is stored in the database. Account numbers are PGP-encrypted; your password and PIN are stored only as BCrypt hashes.</Alert>
            <Button size="lg" className="w-full" onClick={() => router.replace("/bank")} icon={<ArrowRight size={18} />}>Go to my dashboard</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:block">Already a customer? <Link href="/bank/login" className="font-semibold text-brand hover:underline">Sign in</Link></span>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 pb-16 pt-4">
        {/* progress */}
        <ol className="mb-8 flex items-center">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition", i < step ? "bg-success text-white" : i === step ? "bg-brand-gradient text-white shadow-card" : "border border-line bg-surface text-muted")}>
                  {i < step ? <CheckCircle2 size={17} /> : i + 1}
                </span>
                <span className={cn("hidden text-sm font-medium sm:block", i === step ? "text-ink" : "text-muted")}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("mx-3 h-0.5 flex-1 rounded-full transition", i < step ? "bg-success" : "bg-line")} />}
            </li>
          ))}
        </ol>

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }} className="space-y-4">
              {step === 0 && (
                <>
                  <div><h1 className="text-xl font-semibold text-ink">Open your account</h1><p className="text-sm text-muted">Tell us a little about yourself. It takes about two minutes.</p></div>
                  <Field label="Full name"><Input icon={<User size={16} />} value={f.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="As it appears on your ID" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email address"><Input icon={<Mail size={16} />} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" /></Field>
                    <Field label="Phone number"><Input icon={<Phone size={16} />} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08012345678" /></Field>
                  </div>
                  <Field label="Residential address"><Input icon={<Home size={16} />} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="House number, street, city" /></Field>
                </>
              )}
              {step === 1 && (
                <>
                  <div><h2 className="text-xl font-semibold text-ink">Verify your identity</h2><p className="text-sm text-muted">Nigerian banks must confirm who you are (KYC). You can skip this and verify later.</p></div>
                  <Field label="Bank Verification Number (BVN)" hint="11 digits. Only the last four digits are stored."><Input icon={<IdCard size={16} />} inputMode="numeric" maxLength={11} value={f.bvn} onChange={(e) => set("bvn", e.target.value.replace(/\D/g, ""))} placeholder="12345678901" /></Field>
                  <Field label="Name on your ID document" hint="If this does not match your registered name, your KYC status will show a mismatch.">
                    <Input icon={<User size={16} />} value={f.nameOnId} onChange={(e) => set("nameOnId", e.target.value)} placeholder={f.fullName || "Name as printed on the ID"} />
                  </Field>
                  <Alert tone="info" title="Demo tip">Enter a different name on the ID than your registered name to see a KYC mismatch (the analyst dashboard shows how it affects screening).</Alert>
                </>
              )}
              {step === 2 && (
                <>
                  <div><h2 className="text-xl font-semibold text-ink">Secure your account</h2><p className="text-sm text-muted">Choose a strong password and a 4-digit PIN you will use to authorise payments.</p></div>
                  <Field label="Account type">
                    <Select value={f.accountType} onChange={(e) => set("accountType", e.target.value)}><option value="Savings">Savings account</option><option value="Current">Current account</option></Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Password"><Input icon={<Lock size={16} />} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" /></Field>
                    <Field label="Confirm password"><Input icon={<KeyRound size={16} />} type="password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="Repeat password" /></Field>
                  </div>
                  <Field label="Transaction PIN"><PinInput value={f.pin} onChange={(v) => set("pin", v)} /></Field>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => { setError(null); setStep(Math.max(0, step - 1)); }} disabled={step === 0} icon={<ArrowLeft size={16} />}>Back</Button>
            <Button onClick={next} loading={loading} icon={step === 2 ? <BadgeCheck size={17} /> : <ArrowRight size={17} />}>{step === 2 ? "Create my account" : "Continue"}</Button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted">{BRAND.disclaimer}</p>
      </div>
    </div>
  );
}
