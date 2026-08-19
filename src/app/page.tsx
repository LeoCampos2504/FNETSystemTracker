const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-black">
      <main className="w-full max-w-xl rounded-2xl border border-black/[.08] bg-white p-10 text-center dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          FNET System Tracker
        </h1>
        <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Foundation Ready
        </p>

        <dl className="mt-8 space-y-3 text-left text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex justify-between gap-4">
            <dt>API mode</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-100">
              {USE_MOCK_API ? "mock-api" : "http-api"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Health check</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-100">GET /api/health</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Contracts</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-100">src/contracts</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Docs</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-100">CLAUDE.md, docs/</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
