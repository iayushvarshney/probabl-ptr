function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-zinc-200 ${className}`} />;
}

export default function EntityDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="flex animate-pulse flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Bar className="h-7 w-56" />
            <Bar className="h-4 w-32" />
            <div className="mt-1 flex gap-2">
              <Bar className="h-5 w-24 rounded-full" />
              <Bar className="h-5 w-16 rounded-full" />
              <Bar className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Bar className="h-8 w-16" />
            <Bar className="h-3 w-24" />
          </div>
        </header>

        <Bar className="h-11 w-full rounded-lg" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
              <Bar className="h-4 w-28" />
              <Bar className="h-3.5 w-full" />
              <Bar className="h-3.5 w-4/5" />
              <Bar className="h-3.5 w-3/5" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <Bar className="h-4 w-32" />
          <Bar className="h-3.5 w-full" />
          <Bar className="h-3.5 w-full" />
          <Bar className="h-3.5 w-2/3" />
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <Bar className="h-4 w-24" />
          <div className="flex flex-col divide-y divide-zinc-100">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Bar className="h-4 w-40" />
                  <Bar className="h-3 w-16" />
                </div>
                <Bar className="h-3.5 w-full" />
                <Bar className="h-3.5 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
