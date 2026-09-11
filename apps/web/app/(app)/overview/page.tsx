"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Data {
  counts: { memory: number; people: number; connections: number; approvals: number };
  recent: Array<{ seq: number; kind: string; level: string; detail: Record<string, unknown>; createdAt: string }>;
}

function Tile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius)] border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent/40"
    >
      <div className="text-[24px] font-semibold tracking-tight text-foreground">{value}</div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </Link>
  );
}

export default function Overview() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Overview</h1>
      </header>

      {!data ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Memories" value={data.counts.memory} href="/memory" />
            <Tile label="People" value={data.counts.people} href="/people" />
            <Tile label="Connections" value={data.counts.connections} href="/connections" />
            <Tile label="Waiting for you" value={data.counts.approvals} href="/approvals" />
          </div>

          {data.counts.approvals > 0 && (
            <Link
              href="/approvals"
              className="rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-[13px] text-foreground hover:bg-accent/40"
            >
              ⏳ {data.counts.approvals} action(s) need your approval →
            </Link>
          )}

          <div>
            <div className="mb-2 text-[12px] uppercase tracking-wide text-subtle-foreground">Recent activity</div>
            {data.recent.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.recent.map((e) => (
                  <li key={e.seq} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span className={e.level === "error" ? "text-destructive" : "text-subtle-foreground"}>•</span>
                    <span className="text-foreground">{e.kind}</span>
                    <span className="text-subtle-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
