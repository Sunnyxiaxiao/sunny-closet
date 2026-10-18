import Link from "next/link";
import { shop } from "@/config/shop";
import { localePath, type Locale } from "@/i18n/config";
import { getMessages } from "@/messages";
import { LanguageSwitch } from "./language-switch";
import { MobileMenu } from "./mobile-menu";

/**
 * 顶部导航的链接。group：shop = 商品（宽屏放在店名左边），info = 须知、品牌故事这类（放在店名右边）。
 * 手机菜单里按这个顺序全部列出。
 */
export function navLinks(locale: Locale) {
  const t = getMessages(locale).nav;
  return [
    { path: "/styles", label: t.styles, group: "shop" },
    { path: "/helmet-covers", label: t.helmetCovers, group: "shop" },
    { path: "/gloves", label: t.gloves, group: "shop" },
    { path: "/mix-and-match", label: t.mixMatch, group: "shop" },
    { path: "/rental-info", label: t.rentalInfo, group: "info" },
    { path: "/story", label: t.story, group: "info" },
    { path: "/contact", label: t.contact, group: "info" },
  ].map((link) => ({ ...link, href: localePath(locale, link.path) }));
}

export function SiteHeader({ locale, hideLanguageSwitch }: { locale: Locale; hideLanguageSwitch?: boolean }) {
  const t = getMessages(locale);
  const links = navLinks(locale);
  // 宽屏：商品放在店名左边，须知类放在右边（英文菜单比中文长，挤在一边放不下）
  const shopLinks = links.filter((link) => link.group === "shop");
  const infoLinks = links.filter((link) => link.group === "info");
  const navLink = (link: (typeof links)[number]) => (
    <Link key={link.href} href={link.href} className="whitespace-nowrap underline-offset-4 hover:underline">
      {link.label}
    </Link>
  );
  return (
    <>
      <p className="bg-neutral-900 px-4 py-2 text-center text-xs tracking-wide text-white">{t.announcement}</p>
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto grid h-14 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:h-16">
          {/* 窄屏：左上角菜单按钮；宽屏：商品 */}
          <div className="flex items-center">
            <MobileMenu links={links} locale={locale} />
            <nav className="hidden gap-x-5 text-sm lg:flex xl:gap-x-7">{shopLinks.map(navLink)}</nav>
          </div>
          {/* 店名中英文都叫 Sunny Closet，不让浏览器的“翻译此页”把它译成中文 */}
          <Link
            href={localePath(locale, "/")}
            translate="no"
            className="notranslate text-lg font-black uppercase tracking-[0.15em] sm:text-xl sm:tracking-[0.2em]"
          >
            {shop.name}
          </Link>
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <nav className="mr-2 hidden gap-x-5 text-sm lg:flex xl:mr-4 xl:gap-x-7">{infoLinks.map(navLink)}</nav>
            {!hideLanguageSwitch && <LanguageSwitch locale={locale} />}
            {/* 我的账号：没登录会先跳到登录页 */}
            <Link
              href={localePath(locale, "/account")}
              aria-label={t.nav.account}
              title={t.nav.account}
              className="-mr-1.5 p-1.5 sm:mr-0"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="8.5" r="3.75" />
                <path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" strokeLinecap="round" />
              </svg>
            </Link>
            {/* 搜索入口（进全部雪服）：手机上放不下收进菜单；宽屏菜单里已经有“全部雪服”，也不显示 */}
            <Link href={localePath(locale, "/styles")} aria-label={t.nav.styles} className="-mr-2 hidden p-2 sm:block lg:hidden">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
