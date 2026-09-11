"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Account {
  toolkit: string;
  appLabel: string;
  label: string;
  isDefault: boolean;
  status: string;
}
interface Connectable {
  slug: string;
  label: string;
}

export default function Connections() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [connectable, setConnectable] = useState<Connectable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/connections");
    const data = res.ok ? await res.json() : { accounts: [], connectable: [] };
    setAccounts(data.accounts ?? []);
    setConnectable(data.connectable ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function connect(toolkit: string) {
    setBusy(toolkit);
    const res = await fetch("/api/connections/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolkit }),
    });
    const data = await res.json();
    setBusy(null);
    if (data.redirectUrl) window.open(data.redirectUrl, "_blank", "noopener");
  }

  async function makeDefault(account: string) {
    setBusy(account);
    await fetch("/api/connections/default", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account }),
    });
    setBusy(null);
    await load();
  }

  // group accounts by app
  const byApp = new Map<string, Account[]>();
  for (const a of accounts) {
    const list = byApp.get(a.appLabel) ?? [];
    list.push(a);
    byApp.set(a.appLabel, list);
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Connections</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The accounts helloo can read and act on. You can connect several of the same app.
        </p>
      </header>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {[...byApp.entries()].map(([app, list]) => (
            <div key={app} className="rounded-[var(--radius)] border border-border bg-card p-4">
              <div className="mb-2 text-[14px] font-medium text-foreground">{app}</div>
              <ul className="flex flex-col gap-1.5">
                {list.map((a) => (
                  <li key={a.label} className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">
                      {a.label}
                      {a.status !== "ACTIVE" && <span className="ml-2 text-destructive">({a.status.toLowerCase()})</span>}
                    </span>
                    {a.isDefault ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground">default</span>
                    ) : (
                      <button
                        className="text-[12px] text-muted-foreground hover:text-foreground"
                        disabled={busy === a.label}
                        onClick={() => makeDefault(a.label)}
                      >
                        Make default
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {connectable.length > 0 && (
            <div>
              <div className="mb-2 text-[12px] uppercase tracking-wide text-subtle-foreground">Connect more</div>
              <div className="flex flex-wrap gap-2">
                {connectable.map((c) => (
                  <Button
                    key={c.slug}
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full"
                    disabled={busy === c.slug}
                    onClick={() => connect(c.slug)}
                  >
                    + {c.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
