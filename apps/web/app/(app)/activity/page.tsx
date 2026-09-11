"use client";

import { useEffect, useState } from "react";

interface Event {
  seq: number;
  kind: string;
  level: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

function detailText(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("  ·  ");
}

export default function Activity() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">What helloo has been doing — reminders, workflows, and any hiccups.</p>
      </header>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-8 text-center">
          <p className="text-[14px] font-medium text-foreground">Quiet so far</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Background activity will show up here.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
          {events.map((e) => (
            <li key={e.seq} className="flex items-start gap-3 px-4 py-2.5">
              <span className={e.level === "error" ? "mt-1.5 text-destructive" : "mt-1.5 text-subtle-foreground"}>•</span>
              <div className="min-w-0">
                <div className="text-[13px] text-foreground">
                  {e.kind}
                  {e.level === "error" && <span className="ml-2 text-[11px] text-destructive">error</span>}
                </div>
                {detailText(e.detail) && <div className="truncate text-[12px] text-muted-foreground">{detailText(e.detail)}</div>}
              </div>
              <span className="ml-auto whitespace-nowrap text-[11px] text-subtle-foreground">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
