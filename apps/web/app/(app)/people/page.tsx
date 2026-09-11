"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface Identity {
  channel: string;
  value: string;
}
interface Person {
  id: string;
  displayName: string;
  kind: string;
  identities: Identity[];
}

export default function People() {
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(query = "") {
    setLoading(true);
    const res = await fetch(`/api/people${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = res.ok ? await res.json() : { people: [] };
    setPeople(Array.isArray(data.people) ? data.people : []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">People</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Contacts helloo knows, and how to reach them.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
        className="mb-5"
      >
        <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : people.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-border bg-card p-8 text-center">
          <p className="text-[14px] font-medium text-foreground">No people yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Ask helloo to import your contacts from email to build this.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.id} className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
              <div className="text-[14px] font-medium text-foreground">{p.displayName}</div>
              {p.identities.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                  {p.identities.map((i, idx) => (
                    <span key={idx}>
                      {i.channel}: {i.value}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
