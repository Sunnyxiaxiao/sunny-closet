/**
 * 商品图都存在 Supabase 的 style-images 存储桶里，每张大图（长边 ≤ 2000px）旁边有一张小图：
 *   xxx.jpg → xxx.sm.jpg（宽 ≤ 600px）
 * 列表卡片、缩略图用小图，详情页大图用原图，省 Supabase 的流量。
 * 两种上传方式（scripts/import-catalog.mjs、后台 admin-image-uploader）都会同时上传小图；
 * 以前传的图用 npm run images:backfill 补小图。
 */

export const IMAGE_BUCKET = "style-images";
export const THUMB_WIDTH = 600;
/** 文件上传后内容不再改（换图会换地址），浏览器和 CDN 可以缓存一年 */
export const IMAGE_CACHE_SECONDS = "31536000";

const BUCKET_PATH = `/storage/v1/object/public/${IMAGE_BUCKET}/`;

/** 小图地址；不是存储桶里的 JPG（例如外部图片）时原样返回 */
export function thumbUrl<T extends string | undefined>(url: T): T {
  if (!url || !url.includes(BUCKET_PATH)) return url;
  return url.replace(/(?<!\.sm)\.jpg(?=\?|$)/, ".sm.jpg") as T;
}
