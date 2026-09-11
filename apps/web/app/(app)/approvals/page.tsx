"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Approval {
  id: string;
  tool: string;
  risk: string;
  args: Record<string, unknown>;
  createdAt: string;
}

function summarize(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, v]) => typeof v === "string" && v.length > 0 && v.length < 120)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("  ·  ");
}

export default function Approvals() {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/approvals");
    const data = res.ok ? await res.json() : { requests: [] };
    setItems(Array.isArray(data.requests) ? data.requests : []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, decision: "allow" | "deny", rememberScope?: "always_for") {
    setBusy(id);
    await fetch("/api/approvals/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, decision, rememberScope }),
    });
    setBusy(null);
    await load();
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Approvals</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Actions helloo has prepared. Nothing is sent or changed until you approve it.
        </p>
      </header>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-8 text-center">
          <p className="text-[14px] font-medium text-foreground">Nothing waiting</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            When helloo wants to send or change something, it&apos;ll show up here first.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-[var(--radius)] border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground">{a.tool}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{a.risk}</span>
              </div>
              {summarize(a.args) && <p className="mt-1.5 text-[13px] text-muted-foreground">{summarize(a.args)}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="h-8 rounded-full" disabled={busy === a.id} onClick={() => act(a.id, "allow")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full"
                  disabled={busy === a.id}
                  onClick={() => act(a.id, "allow", "always_for")}
                >
                  Always allow
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full"
                  disabled={busy === a.id}
                  onClick={() => act(a.id, "deny")}
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
