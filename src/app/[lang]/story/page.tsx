import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { shop } from "@/config/shop";
import { localePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).story.title };
}

/** 品牌故事：为什么做 Sunny Closet。文字在 messages 的 story 里改（中英文各一份） */
export default async function StoryPage() {
  const locale = await getLocale();
  const t = getMessages(locale).story;
  return (
    <article>
      {/* 首页那张滑雪板图，横向完整显示；手机上可以左右滑动 */}
      <div className="no-scrollbar overflow-x-auto bg-neutral-950">
        <Image
          src={shop.heroImage.src}
          width={shop.heroImage.width}
          height={shop.heroImage.height}
          alt=""
          unoptimized
          sizes="100vw"
          className="block h-48 w-auto min-w-full max-w-none object-cover sm:h-auto sm:w-full sm:max-w-full"
        />
      </div>
      <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{t.eyebrow}</p>
        <h1 className="mt-3 whitespace-pre-line text-3xl font-black leading-tight sm:text-4xl">{t.heading}</h1>
        <div className="mt-8 space-y-5 text-base leading-relaxed text-neutral-700">
          {t.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <p className="mt-8 font-semibold">{t.signature}</p>
        <Link
          href={localePath(locale, "/styles")}
          className="mt-10 inline-flex h-12 items-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-widest text-white hover:bg-neutral-700"
        >
          {t.cta}
        </Link>
      </div>
    </article>
  );
}
