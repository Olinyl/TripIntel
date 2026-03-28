"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

function getSafeNextPath(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function SignupPageContent() {
  const authOptionalMode = process.env.NEXT_PUBLIC_DISABLE_AUTH !== "false";
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || cooldown > 0) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        console.error("[Signup] Sign up failed:", error.message);
        if (error.message.toLowerCase().includes("rate")) {
          setErrorMessage("Rate limit exceeded. Please wait 60 seconds before trying again.");
          startCooldown(60);
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      if (data.session) {
        // Force a hard navigation so server components re-read the fresh auth cookie.
        window.location.href = nextPath;
        return;
      }

      setSuccessMessage("Signup successful. Check your email to confirm your account.");
    } catch (error) {
      console.error("[Signup] Unexpected error:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("fetch")) {
        setErrorMessage("Failed to fetch auth service. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY and your network.");
      } else {
        setErrorMessage("Unexpected error during sign up. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-zinc-50">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-xl">
        <h1 className="mb-2 text-xl font-semibold tracking-tight">Create your TripIntel account</h1>
        <p className="mb-6 text-sm text-zinc-500">Start tracking smarter fares in seconds.</p>

        <button
          type="button"
          onClick={() => {
            window.location.href = nextPath;
          }}
          className="mb-4 inline-flex w-full items-center justify-center rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
        >
          Continue as guest
        </button>

        {authOptionalMode && (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            Sign in is optional in this environment. You can continue as guest anytime.
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm text-zinc-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 outline-none ring-0 focus:border-zinc-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-zinc-400" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 outline-none ring-0 focus:border-zinc-500"
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || cooldown > 0}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? "Creating account..." : cooldown > 0 ? `Wait ${cooldown}s` : "Sign up"}
          </button>
        </form>

        <p className="mt-4 text-xs text-zinc-500">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="text-zinc-200 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}>
      <SignupPageContent />
    </Suspense>
  );
}

