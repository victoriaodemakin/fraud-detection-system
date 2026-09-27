"use client";

import { useState } from "react";
import { Alert, Modal } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/base";
import { PinInput } from "@/components/ui/pin";
import { useToast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/http";
import { useBank } from "./BankShell";

export type ChangeKind = "phone" | "email" | "address" | "pin";

const CFG: Record<ChangeKind, { title: string; label: string; placeholder: string; warn: string; type?: string }> = {
  phone: { title: "Change phone number", label: "New phone number", placeholder: "08012345678", warn: "For your security, payments made shortly after a phone number change may be reviewed more closely." },
  email: { title: "Change email address", label: "New email address", placeholder: "you@example.com", type: "email", warn: "For your security, payments made shortly after a change to your contact details may be reviewed more closely." },
  address: { title: "Change residential address", label: "New address", placeholder: "House number, street, city", warn: "For your security, payments made shortly after a change to your contact details may be reviewed more closely." },
  pin: { title: "Change transaction PIN", label: "", placeholder: "", warn: "Choose a PIN that is hard to guess. For your security, large payments made shortly after a PIN change may be reviewed more closely." },
};

// One dialog for all sensitive profile changes; each is confirmed with the PIN and recorded
// (profile-change history + audit log), which is what the rule engine reads afterwards.
export function ChangeDialog({ kind, onClose, onDone }: { kind: ChangeKind | null; onClose: () => void; onDone: () => void }) {
  const { refresh, refreshUnread } = useBank();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => {
    setValue("");
    setPin("");
    setNewPin("");
    setErr(null);
    onClose();
  };

  async function submit() {
    if (!kind) return;
    setBusy(true);
    setErr(null);
    try {
      if (kind === "pin") await api("bank", "/bank/profile/pin", { method: "POST", body: { currentPin: pin, newPin } });
      else await api("bank", `/bank/profile/${kind}`, { method: "POST", body: { value, pin } });
      toast.success("Saved", `${CFG[kind].title.replace("Change ", "")} updated.`);
      await refresh();
      await refreshUnread();
      onDone();
      close();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save the change.");
    } finally {
      setBusy(false);
    }
  }

  const cfg = kind ? CFG[kind] : null;
  const valid = kind === "pin" ? pin.length === 4 && newPin.length === 4 : value.trim().length > 3 && pin.length === 4;

  return (
    <Modal open={!!kind} onClose={close} title={cfg?.title} footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!valid}>Save change</Button></>}>
      {cfg && (
        <div className="space-y-4">
          <Alert tone={kind === "pin" ? "info" : "warn"}>{cfg.warn}</Alert>
          {kind === "pin" ? (
            <>
              <Field label="Current PIN"><PinInput value={pin} onChange={setPin} invalid={!!err} /></Field>
              <Field label="New PIN"><PinInput value={newPin} onChange={setNewPin} /></Field>
            </>
          ) : (
            <>
              <Field label={cfg.label}><Input type={cfg.type ?? "text"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={cfg.placeholder} /></Field>
              <Field label="Confirm with your PIN"><PinInput value={pin} onChange={setPin} invalid={!!err} /></Field>
            </>
          )}
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      )}
    </Modal>
  );
}
