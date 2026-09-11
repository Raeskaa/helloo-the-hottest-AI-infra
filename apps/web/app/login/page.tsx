"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Sign in with an email one-time code (Better Auth email-OTP). Net-new surface — the old app had no
 * auth UI. Two steps in one card: enter email → enter the 6-digit code.
 */
export default function Login() {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't send the code. Check the email and try again.");
      return;
    }
    setStage("code");
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "That code didn't work. Try again or resend.");
      return;
    }
    router.push("/ask");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--app-bg)] px-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-card p-7 shadow-sm">
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">helloo</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {stage === "email" ? "Sign in with your email." : `Enter the code we sent to ${email}.`}
          </p>
        </div>

        {stage === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void sendCode();
            }}
            className="flex flex-col gap-3"
          >
            <Input
              type="email"
              autoFocus
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={busy || !email.trim()} className="h-10 rounded-full">
              {busy ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void verify();
            }}
            className="flex flex-col gap-3"
          >
            <Input
              inputMode="numeric"
              autoFocus
              required
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" disabled={busy || !code.trim()} className="h-10 rounded-full">
              {busy ? "Verifying…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStage("email");
                setCode("");
                setError(null);
              }}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}
      </div>
    </main>
  );
}
