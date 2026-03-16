import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const supabase = getServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-zinc-50">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Create your TripIntel account</h1>
        <form
          className="space-y-4"
          action={async (formData) => {
            "use server";
            const email = formData.get("email") as string;
            const password = formData.get("password") as string;
            const client = getServerSupabaseClient();
            const { error } = await client.auth.signUp({ email, password });
            if (!error) {
              redirect("/dashboard");
            }
          }}
        >
          <div className="space-y-1">
            <label className="text-sm text-zinc-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
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
              required
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 outline-none ring-0 focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-black transition hover:bg-white"
          >
            Sign up
          </button>
        </form>
        <p className="mt-4 text-xs text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-200 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

