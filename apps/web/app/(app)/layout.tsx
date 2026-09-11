import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/session";
import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentOwner())) redirect("/login");
  return (
    <div className="flex min-h-dvh bg-[var(--app-bg)]">
      <AppNav />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
