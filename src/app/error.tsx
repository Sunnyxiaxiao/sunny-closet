"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">出了点问题</h1>
      <p className="mt-2 text-slate-600">页面加载失败，请稍后再试。</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center rounded-full bg-brand-600 px-5 font-semibold text-white"
      >
        重新加载
      </button>
    </div>
  );
}
