import Link from "next/link";
import { signOut } from "@/app/admin/actions";
import { messages } from "@/messages/zh-CN";

const t = messages.admin;

const LINKS = [
  { key: "orders", href: "/admin", label: t.ordersTitle },
  { key: "inventory", href: "/admin/inventory", label: "库存" },
  { key: "pricing", href: "/admin/pricing", label: "价格" },
  { key: "helmet-covers", href: "/admin/helmet-covers", label: t.helmetCoversTitle },
] as const;

/** 后台顶部：订单 / 库存 / 价格 / 头盔套 切换 + 退出登录 */
export function AdminNav({ current }: { current: (typeof LINKS)[number]["key"] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <nav className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {LINKS.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            aria-current={link.key === current ? "page" : undefined}
            className={
              link.key === current
                ? "shrink-0 text-2xl font-black"
                : "shrink-0 text-2xl font-black text-neutral-300 hover:text-neutral-500"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <form action={signOut}>
        <button type="submit" className="text-sm underline underline-offset-4 hover:text-neutral-600">
          {t.signOut}
        </button>
      </form>
    </div>
  );
}
