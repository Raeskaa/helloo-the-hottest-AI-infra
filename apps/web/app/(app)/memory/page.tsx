"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface Item {
  id: string;
  text: string;
  predicate?: string;
  visibility?: string;
  createdAt?: string;
}

export default function Memory() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(query = "") {
    setLoading(true);
    const res = await fetch(`/api/memory${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = res.ok ? await res.json() : { items: [] };
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Memory</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">What helloo remembers about you — yours, private to you.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
        className="mb-5"
      >
        <Input placeholder="Search your memory…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-8 text-center">
          <p className="text-[14px] font-medium text-foreground">Nothing here yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Tell helloo things and they&apos;ll show up here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
              <p className="text-[14px] text-foreground">{it.text}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-subtle-foreground">
                {it.predicate && <span>{it.predicate}</span>}
                {it.visibility && <span>· {it.visibility}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
