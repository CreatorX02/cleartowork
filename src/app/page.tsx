import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/tenant";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">ClearToWork</h1>
      <p className="max-w-md text-lg text-gray-600 dark:text-gray-300">
        Right to work compliance for small UK hospitality, food and care
        businesses. Never miss a follow-up check again.
      </p>
      <div className="flex gap-4">
        <Link
          href="/sign-up"
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
        >
          Get started
        </Link>
        <Link
          href="/sign-in"
          className="rounded-lg border border-gray-300 px-6 py-3 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
