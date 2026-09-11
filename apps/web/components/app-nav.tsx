"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, MessageSquare, ShieldCheck, Layers, Users, Plug, AlignLeft, Lock, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV: Array<{ href: string; label: string; Icon: typeof Layers }> = [
  { href: "/overview", label: "Overview", Icon: Home },
  { href: "/ask", label: "Ask", Icon: MessageSquare },
  { href: "/approvals", label: "Approvals", Icon: ShieldCheck },
  { href: "/memory", label: "Memory", Icon: Layers },
  { href: "/people", label: "People", Icon: Users },
  { href: "/connections", label: "Connections", Icon: Plug },
  { href: "/activity", label: "Activity", Icon: AlignLeft },
  { href: "/shared", label: "What's shared", Icon: Lock },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex w-[220px] flex-col border-r border-border bg-sidebar px-3 py-4">
      <div className="px-2.5 pb-4 text-[18px] font-semibold tracking-tight text-foreground">helloo</div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-2.5 py-[8px] text-[14px] font-medium transition-colors",
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={signOut}
        className="mt-auto px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:text-foreground"
      >
        Sign out
      </button>
    </aside>
  );
}
