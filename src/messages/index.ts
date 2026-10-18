import type { Locale } from "@/i18n/config";
import { messages as en } from "./en";
import { messages as zh, type Messages } from "./zh-CN";

export type { Messages };

const ALL: Record<Locale, Messages> = { zh, en };

/** 某种语言的界面文字（前台用；后台只有中文，直接 import zh-CN） */
export function getMessages(locale: Locale): Messages {
  return ALL[locale];
}

/**
 * 尺码 / 颜色名：库存里存的是中文（例如「芭比玫红 · S」「均码」「绿色」），英文页面按 sizeNames 翻译，
 * 用「 · 」连起来的每一段分别翻译，查不到的原样显示（字母尺码 S/M/L 本来就不用翻）。
 */
export function sizeLabel(size: string, locale: Locale): string {
  const names = ALL[locale].sizeNames;
  return size
    .split(" · ")
    .map((part) => names[part] ?? part)
    .join(" · ");
}
