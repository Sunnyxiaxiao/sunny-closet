import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-5xl">❄</p>
      <h1 className="mt-4 text-xl font-semibold">页面不存在</h1>
      <p className="mt-2 text-slate-600">这个页面可能已下架或地址有误。</p>
      <Link
        href="/styles"
        className="mt-6 inline-flex h-11 items-center rounded-full bg-brand-600 px-5 font-semibold text-white"
      >
        看看全部款式
      </Link>
    </div>
  );
}
