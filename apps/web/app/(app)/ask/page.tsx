"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Msg {
  role: "user" | "assistant";
  text: string;
  pending?: number;
}

export default function Ask() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Load the persisted conversation on mount (server-side history).
  useEffect(() => {
    fetch("/api/ask")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = res.ok ? await res.json() : { reply: "Sorry — something went wrong.", pendingApprovals: 0 };
    setBusy(false);
    setMessages((m) => [...m, { role: "assistant", text: data.reply ?? "…", pending: data.pendingApprovals ?? 0 }]);
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <header className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Ask helloo</h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            Ask anything — helloo reads your accounts and remembers. Anything it sends or changes waits for your approval.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-[14px] bg-primary px-3.5 py-2 text-[14px] text-primary-foreground"
                  : "max-w-[80%] rounded-[14px] border border-border bg-card px-3.5 py-2 text-[14px] text-foreground"
              }
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.pending ? (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  ⏳ {m.pending} action(s) waiting —{" "}
                  <Link href="/approvals" className="underline">
                    review in Approvals
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {busy && <p className="text-[13px] text-muted-foreground">helloo is thinking…</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2 border-t border-border pt-3"
      >
        <Input placeholder="Message helloo…" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
        <Button type="submit" className="h-10 rounded-full" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
