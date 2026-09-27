"use client";

import { Bell, CheckCheck, Gift, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useBank } from "@/components/bank/BankShell";
import { Badge, Button, Card, PageHeader, cn } from "@/components/ui/base";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/http";
import { dateTime, timeAgo } from "@/lib/format";

interface Note { id: number; kind: string; title: string; body: string; transactionId: number | null; read: boolean; createdAt: string }

export default function NotificationsPage() {
  const { refreshUnread } = useBank();
  const { data, error, loading, reload } = useApi<{ items: Note[]; unread: number }>("bank", "/bank/notifications");

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const icon = (k: string) => (k === "Security" ? <ShieldAlert size={18} /> : k === "Promo" ? <Gift size={18} /> : <Wallet size={18} />);
  const tone = (k: string) => (k === "Security" ? "bg-warnsoft text-warn" : k === "Promo" ? "bg-brandsoft text-brand" : "bg-brand2soft text-brand2");

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={data.unread > 0 ? `${data.unread} unread` : "You are all caught up."}
        actions={<Button variant="secondary" icon={<CheckCheck size={16} />} disabled={data.unread === 0} onClick={async () => { await api("bank", "/bank/notifications/read-all", { method: "POST" }); await refreshUnread(); reload(); }}>Mark all as read</Button>}
      />
      <Card>
        {data.items.length === 0 ? (
          <EmptyState title="No notifications" body="Payment results, security alerts and offers will show up here." icon={<Bell size={22} />} />
        ) : (
          <ul>
            {data.items.map((n) => {
              const inner = (
                <div className={cn("flex items-start gap-4 border-b border-line px-5 py-4 last:border-b-0", !n.read && "bg-brandsoft/40")}>
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone(n.kind))}>{icon(n.kind)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{n.title}</p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-brand" />}
                    </div>
                    <p className="mt-0.5 text-sm text-ink2">{n.body}</p>
                    <p className="mt-1 text-xs text-muted" title={dateTime(n.createdAt)}>{timeAgo(n.createdAt)}</p>
                  </div>
                  <Badge tone={n.kind === "Security" ? "warn" : n.kind === "Promo" ? "purple" : "blue"}>{n.kind}</Badge>
                </div>
              );
              return <li key={n.id}>{n.transactionId ? <Link href={`/bank/transactions/${n.transactionId}`} className="block transition hover:bg-brandsoft/30">{inner}</Link> : inner}</li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
