"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">出了点问题</h1>
      <p className="mt-2 text-sm text-neutral-600">页面加载失败，请稍后再试。</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-12 items-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-wider text-white hover:bg-neutral-700"
      >
        重新加载
      </button>
    </div>
  );
}
