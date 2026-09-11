"use client";

import { useEffect, useState } from "react";

interface Data {
  counts: { private: number; shared: number; org: number };
  exposed: Array<{ id: string; text: string; visibility: string }>;
}

export default function Shared() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch("/api/shared")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">What&apos;s shared</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Your memory is private by default. Anything shared beyond you shows here.</p>
      </header>

      {!data ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-[var(--radius)] border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[14px] text-foreground">
              🔒 <span className="font-medium">{data.counts.private}</span> memories private to you
            </div>
            {data.counts.shared + data.counts.org > 0 && (
              <div className="mt-1 text-[13px] text-muted-foreground">
                {data.counts.shared} shared · {data.counts.org} org-wide
              </div>
            )}
          </div>

          {data.exposed.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing is shared beyond you — everything stays in your membrane.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.exposed.map((it) => (
                <li key={it.id} className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                  <p className="text-[14px] text-foreground">{it.text}</p>
                  <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                    {it.visibility}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
