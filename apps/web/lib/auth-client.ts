"use client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/** Better Auth browser client — talks to same-origin /api/auth/*. */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
