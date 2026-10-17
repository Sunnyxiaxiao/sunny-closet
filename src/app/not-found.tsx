import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-5xl font-black">404</p>
      <h1 className="mt-4 text-lg font-semibold">页面不存在</h1>
      <p className="mt-2 text-sm text-neutral-600">这套雪服可能已下架，或者地址有误。</p>
      <Link
        href="/styles"
        className="mt-8 inline-flex h-12 items-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-wider text-white hover:bg-neutral-700"
      >
        看看全部雪服
      </Link>
    </div>
  );
}
