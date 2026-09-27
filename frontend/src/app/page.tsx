"use client";

import { motion } from "framer-motion";
import {
  ArrowRight, Banknote, Brain, CheckCircle2, CreditCard, Fingerprint, Gauge, Globe2, HandCoins, Layers, LineChart, ListChecks, Lock, MapPin, Receipt, Send, ShieldCheck, Smartphone, Timer, UserCog,
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/shared/Logo";
import { LinkButton } from "@/components/ui/base";
import { BRAND } from "@/lib/brand";

const FEATURES = [
  { icon: Send, title: "Instant transfers", body: "Send money to saved payees in a few taps, with every payment protected." },
  { icon: Receipt, title: "Bills & airtime", body: "Electricity, cable TV, data, water and internet, all in one place." },
  { icon: CreditCard, title: "Card payments", body: "Shop online with a card that is screened before the merchant is paid." },
  { icon: Banknote, title: "ATM withdrawals", body: "Withdraw cash with velocity limits that stop card-cloning attacks." },
  { icon: HandCoins, title: "Request money", body: "Ask friends and customers to pay you, then follow the payment." },
  { icon: LineChart, title: "Spending insights", body: "See where your money goes with clear charts and category breakdowns." },
];

const CATEGORIES = [
  { icon: Timer, name: "Velocity", text: "Bursts of transactions, ATM limits, login abuse" },
  { icon: Banknote, name: "Amount", text: "Large, unusual and repeated \"test\" amounts" },
  { icon: Globe2, name: "Geographic", text: "Impossible travel, new and high-risk countries" },
  { icon: Smartphone, name: "Device & channel", text: "New devices, VPN/Tor, SIM swaps" },
  { icon: Fingerprint, name: "Behavioural", text: "Odd hours, dormant accounts, new payees" },
  { icon: UserCog, name: "Account & profile", text: "Recent changes, new accounts, KYC gaps" },
  { icon: CreditCard, name: "Merchant & type", text: "High-risk merchants and shipping addresses" },
  { icon: Layers, name: "Structuring (AML-adjacent)", text: "Just-under-threshold and pass-through patterns" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink2 md:flex">
            <a href="#features" className="hover:text-brand">Features</a>
            <a href="#protection" className="hover:text-brand">Fraud protection</a>
            <a href="#rules" className="hover:text-brand">Rules engine</a>
            <Link href="/admin/login" className="hover:text-brand">Analyst portal</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LinkButton href="/bank/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</LinkButton>
            <LinkButton href="/bank/register" size="sm">Open an account</LinkButton>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="hero-mesh relative overflow-hidden text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:py-28">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium">
              <ShieldCheck size={14} /> Hybrid rule-based + machine learning fraud detection
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{BRAND.tagline}.</h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              {BRAND.full} screens every transfer, bill, card payment and withdrawal in real time, with thirty-three rule checks and two machine learning models, before a naira leaves your account.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/bank/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-[#3b1275] shadow-pop transition hover:bg-white/90">
                Open internet banking <ArrowRight size={18} />
              </Link>
              <Link href="/admin/login" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 font-medium transition hover:bg-white/20">
                Fraud analyst portal
              </Link>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-white/70">
              <Lock size={13} /> Account numbers and counterparties are PGP-encrypted at rest.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="relative mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-white/20 bg-white/10 p-5 shadow-pop backdrop-blur-md">
              <p className="text-xs uppercase tracking-wider text-white/70">Live screening</p>
              {[
                { t: "Transfer to Amina Yusuf", a: "₦25,000", s: "Approved", r: 4, c: "bg-emerald-400/20 text-emerald-100" },
                { t: "Card payment · QuickDeal Global", a: "₦180,000", s: "Held for review", r: 52, c: "bg-amber-400/25 text-amber-100" },
                { t: "Transfer from London, new device", a: "₦300,000", s: "Blocked", r: 94, c: "bg-rose-400/25 text-rose-100" },
              ].map((x, i) => (
                <motion.div key={x.t} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.25 }} className="mt-3 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{x.t}</p>
                    <p className="text-xs text-white/70">{x.a} · risk score {x.r}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${x.c}`}>{x.s}</span>
                </motion.div>
              ))}
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-[#3b1275]">
                <span className="flex items-center gap-2 text-sm font-medium"><Gauge size={16} /> 33 rules + 2 ML models</span>
                <span className="text-xs font-semibold">under 1 second</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-brand">Everything in one app</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">A complete internet-banking experience</h2>
          <p className="mt-3 text-muted">Every payment type you expect, each one protected by the same fraud framework.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-1 hover:shadow-pop">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brandsoft text-brand"><f.icon size={20} /></div>
              <h3 className="mt-4 font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* protection */}
      <section id="protection" className="bg-soft py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-brand2">The framework</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Three layers between a thief and your money</h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              { n: "1", icon: ListChecks, title: "Rules engine", body: "Thirty-three transparent, auditable rules check velocity, amounts, location, device, behaviour, profile, merchant and structuring patterns. Each failed rule adds weighted points.", tone: "from-[#3b1275] to-[#5b21b6]" },
              { n: "2", icon: Brain, title: "Machine learning", body: "Logistic regression and a decision tree, trained on real labelled fraud with SMOTE, score how much the transaction resembles known fraud. Their probabilities are averaged.", tone: "from-[#1e3a8a] to-[#2447b8]" },
              { n: "3", icon: UserCog, title: "Analyst review", body: "A hybrid risk score from 0 to 100 approves, holds or blocks the payment. Held cases go to a fraud analyst who sees every check, decrypts protected data and decides.", tone: "from-[#312e81] to-[#4c1d95]" },
            ].map((l, i) => (
              <motion.div key={l.n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
                <div className={`bg-gradient-to-br ${l.tone} p-6 text-white`}>
                  <div className="flex items-center justify-between">
                    <l.icon size={28} />
                    <span className="text-5xl font-semibold text-white/25">{l.n}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{l.title}</h3>
                </div>
                <p className="p-6 text-sm leading-relaxed text-ink2">{l.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* rules */}
      <section id="rules" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-sm font-semibold text-brand">Rules engine</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Eight families of fraud rules, fully configurable</h2>
            <p className="mt-3 text-muted">Analysts can change every threshold, weight and switch from the Rules page. Every transaction records a pass or fail for every rule, so nothing is a black box.</p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink2">
              {["Pass / fail table for every screened transaction", "Weights summed into a rule score, capped at 100", "Hard-block rules stop extreme transactions outright", "Segment-aware thresholds for students and premium customers"].map((t) => (
                <li key={t} className="flex items-start gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((c, i) => (
              <motion.div key={c.name} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand2soft text-brand2"><c.icon size={18} /></div>
                <div>
                  <p className="text-sm font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="hero-mesh rounded-3xl px-8 py-14 text-center text-white">
          <MapPin className="mx-auto mb-3" size={28} />
          <h2 className="text-3xl font-semibold tracking-tight">Try it: log in, send money from “London”, and watch the rules react</h2>
          <p className="mx-auto mt-3 max-w-2xl text-white/80">The demo lab lets you simulate a new device, an odd hour or a foreign location on any payment and read the full screening report afterwards.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/bank/login" className="inline-flex h-12 items-center rounded-xl bg-white px-6 font-semibold text-[#3b1275]">Customer sign in</Link>
            <Link href="/admin/login" className="inline-flex h-12 items-center rounded-xl border border-white/30 bg-white/10 px-6 font-medium">Analyst portal</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-soft py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs text-muted sm:flex-row">
          <Logo />
          <p className="text-center sm:text-right">{BRAND.disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
