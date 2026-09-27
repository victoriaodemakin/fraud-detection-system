"use client";

import { BadgeCheck, Building2, Copy, IdCard, Info, Mail, MapPin, Phone, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { ChangeDialog, type ChangeKind } from "@/components/bank/ChangeDialog";
import { useBank } from "@/components/bank/BankShell";
import { Alert } from "@/components/ui/feedback";
import { Avatar, Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/base";
import { DefRow } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { dateOnly, naira } from "@/lib/format";

const SEGMENT_INFO: Record<string, string> = {
  Standard: "Standard account.",
  Premium: "Premium account with higher payment limits.",
  Student: "Student account with lower payment limits.",
};

export default function ProfilePage() {
  const { profile } = useBank();
  const toast = useToast();
  const [dlg, setDlg] = useState<ChangeKind | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Profile & KYC" subtitle="Your details, identity verification status and accounts." />

      <Card className="overflow-hidden">
        <div className="hero-mesh flex flex-wrap items-center gap-5 p-6 text-white">
          <Avatar name={profile.fullName} size={72} />
          <div className="flex-1">
            <h2 className="text-2xl font-semibold">{profile.fullName}</h2>
            <p className="text-sm text-white/80">Customer since {dateOnly(profile.createdAt)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="border-white/30 bg-white/15 text-white">{profile.segment} segment</Badge>
              <Badge className="border-white/30 bg-white/15 text-white">KYC {profile.kyc}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal information" icon={<IdCard size={16} />} />
          <div className="px-5 py-2">
            <DefRow label="Full name">{profile.fullName}</DefRow>
            <DefRow label="Email"><span className="inline-flex items-center gap-2"><Mail size={13} />{profile.email}<button className="text-brand" onClick={() => setDlg("email")}>Edit</button></span></DefRow>
            <DefRow label="Phone"><span className="inline-flex items-center gap-2"><Phone size={13} />{profile.phone}<button className="text-brand" onClick={() => setDlg("phone")}>Edit</button></span></DefRow>
            <DefRow label="Address"><span className="inline-flex items-center gap-2"><MapPin size={13} /><span className="max-w-[16rem] text-right">{profile.address}</span><button className="text-brand" onClick={() => setDlg("address")}>Edit</button></span></DefRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Identity verification (KYC)" icon={profile.kyc === "Verified" ? <BadgeCheck size={16} /> : <ShieldQuestion size={16} />} action={<Badge tone={profile.kyc === "Verified" ? "success" : profile.kyc === "Pending" ? "warn" : "danger"}>{profile.kyc}</Badge>} />
          <div className="space-y-3 p-5">
            <div className="rounded-xl bg-soft px-4 py-3 text-sm"><span className="text-muted">Name on ID: </span><span className="font-medium text-ink">{profile.nameOnId || "not provided"}</span></div>
            {profile.kyc === "Verified" && <Alert tone="success">Your identity is verified. Nothing more to do.</Alert>}
            {profile.kyc === "Pending" && <Alert tone="warn">Verification is pending because a BVN or ID name was not provided. Your payments may be reviewed more closely until it is completed.</Alert>}
            {profile.kyc === "Mismatch" && <Alert tone="danger">The name on your ID does not match your registered name. Your payments may be reviewed more closely until this is corrected.</Alert>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your accounts" icon={<Building2 size={16} />} />
          <ul className="divide-y divide-line">
            {profile.accounts.map((a) => (
              <li key={a.accountId} className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{a.type} account</p>
                  <p className="mt-0.5 flex items-center gap-2 font-mono text-sm text-muted">{a.accountNumber}<button className="text-brand" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(a.accountNumber); toast.info("Copied", a.accountNumber); }}><Copy size={14} /></button></p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-ink">{naira(a.balance, { decimals: 2 })}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={`${profile.segment} customer`} subtitle="Your account category" icon={<Info size={16} />} />
          <p className="p-5 text-sm leading-relaxed text-ink2">{SEGMENT_INFO[profile.segment]}</p>
          <div className="px-5 pb-5"><Button variant="secondary" onClick={() => setDlg("pin")}>Change PIN</Button></div>
        </Card>
      </div>

      <ChangeDialog kind={dlg} onClose={() => setDlg(null)} onDone={() => {}} />
    </div>
  );
}
