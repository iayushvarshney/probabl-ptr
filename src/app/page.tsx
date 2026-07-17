import { MorningQueue } from "@/components/MorningQueue";
import { getQueueEntities } from "@/lib/queue";

export const dynamic = "force-dynamic";

export default async function Home() {
  const entities = await getQueueEntities();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-persian-blue">Morning Queue</h1>
        <p className="mt-1 text-sm text-zinc-500">Who to contact today, in priority order.</p>
      </header>
      <MorningQueue entities={entities} />
    </div>
  );
}
