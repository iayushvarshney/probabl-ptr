import { cookies } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LogInIcon } from "@/components/icons";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/lib/session";

async function login(formData: FormData) {
  "use server";

  const password = formData.get("password");
  const next = formData.get("next");
  const nextParam = typeof next === "string" && next.startsWith("/") ? next : "";
  const expectedPassword = process.env.NAV_SHARED_PASSWORD;

  if (typeof password !== "string" || !expectedPassword || password !== expectedPassword) {
    redirect(`/login?error=1${nextParam ? `&next=${encodeURIComponent(nextParam)}` : ""}`);
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  redirect(nextParam || "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-[#040524] px-4">
      <Image src="/logo.png" alt="Probabl" width={174} height={42} priority />
      <form
        action={login}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="mb-1 text-lg font-semibold text-persian-blue">Probabl Ptr</h1>
        <p className="mb-4 text-sm text-zinc-500">Enter the shared password to continue.</p>

        {next && <input type="hidden" name="next" value={next} />}

        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Password"
          className="mb-3 w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-persian-blue focus:outline-none"
        />

        {error && <p className="mb-3 text-sm text-red-600">Incorrect password.</p>}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-sea-buckthorn px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <LogInIcon className="h-4 w-4" />
          Log in
        </button>
      </form>
    </div>
  );
}
