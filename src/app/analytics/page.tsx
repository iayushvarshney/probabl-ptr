import { AnalyticsView } from "@/components/AnalyticsView";
import { Alert } from "@/components/ui";
import { isMissingTableError } from "@/lib/db-errors";
import { getAnalyticsData } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  try {
    const data = await getAnalyticsData();

    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Aggregate breakdowns of companies and contacts interacting with us, from data already on file — no
            external calls.
          </p>
        </header>
        <AnalyticsView data={data} />
      </div>
    );
  } catch (err) {
    if (!isMissingTableError(err)) throw err;

    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <Alert title="Companies/contacts table not found">
          <p className="text-sm text-zinc-600">
            Run <code>supabase-schema.sql</code> in your Supabase SQL editor, then reload this page.
          </p>
        </Alert>
      </div>
    );
  }
}
