import { MorningQueue } from "@/components/MorningQueue";
import { RefreshQueueButton } from "@/components/RefreshQueueButton";
import { getQueueEntities } from "@/lib/queue";

export const dynamic = "force-dynamic";

export default async function Home() {
  const entities = await getQueueEntities();

  const targetCount = entities.filter((e) => e.isTargetAccount).length;
  const newContactCount = entities.filter(
    (e) => e.relationshipState === "NEW_CONTACT_KNOWN_COMPANY"
  ).length;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Morning Queue</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {entities.length} {entities.length === 1 ? "company" : "companies"} to contact today
            {targetCount > 0 && ` · ${targetCount} target account${targetCount === 1 ? "" : "s"}`}
            {newContactCount > 0 &&
              ` · ${newContactCount} new contact${newContactCount === 1 ? "" : "s"} at known companies`}
          </p>
        </div>
        <RefreshQueueButton />
      </header>
      <MorningQueue entities={entities} />
    </div>
  );
}
