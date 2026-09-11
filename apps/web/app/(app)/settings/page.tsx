"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

interface Data {
  email: string;
  reminders: Array<{ id: string; body: string; repeat: string; when: string }>;
  workflows: Array<{ id: string; name: string; instruction: string }>;
  agents: Array<{ name: string; description: string | null }>;
}

export default function Settings() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    setData(res.ok ? await res.json() : null);
  }
  useEffect(() => {
    void load();
  }, []);

  async function mintMcp() {
    setBusy(true);
    const res = await fetch("/api/settings/mcp-token", { method: "POST" });
    const d = await res.json();
    setBusy(false);
    setMcpUrl(d.url ?? null);
  }

  async function remove(kind: "reminder" | "workflow" | "agent", id: string) {
    await fetch("/api/settings/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    await load();
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Settings</h1>
      </header>

      {!data ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Account">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">{data.email}</span>
              <button onClick={signOut} className="text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </div>
          </Section>

          <Section title="Use helloo from Claude / ChatGPT (MCP)">
            {mcpUrl ? (
              <div className="flex flex-col gap-1.5">
                <code className="break-all rounded-md bg-secondary px-2 py-1.5 text-[12px] text-foreground">{mcpUrl}</code>
                <p className="text-[12px] text-muted-foreground">Add this as a custom MCP connector. Keep it private.</p>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={busy} onClick={mintMcp}>
                {busy ? "Generating…" : "Generate MCP link"}
              </Button>
            )}
          </Section>

          <Section title="Reminders & briefs">
            {data.reminders.length === 0 ? (
              <Empty>No reminders scheduled.</Empty>
            ) : (
              data.reminders.map((r) => (
                <Row key={r.id} main={r.body} sub={`${r.repeat} · ${new Date(r.when).toLocaleString()}`} onRemove={() => remove("reminder", r.id)} />
              ))
            )}
          </Section>

          <Section title="Automations">
            {data.workflows.length === 0 ? (
              <Empty>No automations.</Empty>
            ) : (
              data.workflows.map((w) => <Row key={w.id} main={w.name} sub={w.instruction} onRemove={() => remove("workflow", w.id)} />)
            )}
          </Section>

          <Section title="Custom agents">
            {data.agents.length === 0 ? (
              <Empty>No custom agents.</Empty>
            ) : (
              data.agents.map((a) => <Row key={a.name} main={a.name} sub={a.description ?? ""} onRemove={() => remove("agent", a.name)} />)
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] uppercase tracking-wide text-subtle-foreground">{title}</div>
      <div className="rounded-[var(--radius)] border border-border bg-card p-4">{children}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}
function Row({ main, sub, onRemove }: { main: string; sub: string; onRemove: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px] text-foreground">{main}</div>
        {sub && <div className="truncate text-[12px] text-muted-foreground">{sub}</div>}
      </div>
      <button onClick={onRemove} className="shrink-0 text-[12px] text-muted-foreground hover:text-destructive">
        Remove
      </button>
    </div>
  );
}
