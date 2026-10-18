// 商品介绍模板：catalog/templates/<名字>.md（中文）和 <名字>.en.md（英文）。商品清单里写 "template": "<名字>"，
// 导入时把模板接在这一套自己的介绍后面（每套只写开头一两句外观描述，面料与细节共用模板）。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function templatePath(catalogDir, name, locale = "zh") {
  return join(catalogDir, "templates", locale === "en" ? `${name}.en.md` : `${name}.md`);
}

/** 这一套最终的介绍：自己的介绍 + 模板（没写 template 就原样返回）。locale 为 "en" 时用 descriptionEn 和英文模板 */
export function resolveDescription(entry, catalogDir, locale = "zh") {
  const own = (locale === "en" ? entry.descriptionEn : entry.description) ?? "";
  if (!entry.template) return own;
  const file = templatePath(catalogDir, entry.template, locale);
  if (!existsSync(file)) {
    throw new Error(`${entry.slug} 用的介绍模板不存在：catalog/templates/${file.split("/templates/")[1]}`);
  }
  return [own, readFileSync(file, "utf8")]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}
