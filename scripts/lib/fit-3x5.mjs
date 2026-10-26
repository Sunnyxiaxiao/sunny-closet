// 把一张图做成网页用的 3:5 竖图（1200×2000）
// - 模特照（photo）：按 3:5 裁满画面，自动对准人物，不留边
// - 详情图、尺码表这类带文字的图：完整保留，用图片边缘的平均颜色补边
import { createRequire } from "node:module";
const sharp = createRequire(process.cwd() + "/package.json")("sharp");

export const W = 1200;
export const H = 2000;

/** 图片四条边一圈像素的平均颜色 */
async function edgeColor(buf) {
  const { data, info } = await sharp(buf).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x > 1 && x < info.width - 2 && y > 1 && y < info.height - 2) continue;
      const i = (y * info.width + x) * 3;
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++;
    }
  }
  return { r: Math.round(sum[0] / n), g: Math.round(sum[1] / n), b: Math.round(sum[2] / n) };
}

/** 小图放大后会发糊，补一点锐化（只在放大时做，原图够大就不动） */
export function sharpenIfUpscaled(image, scale) {
  return scale > 1.05 ? image.sharpen({ sigma: 1 + Math.min(scale - 1, 1) * 0.5, m1: 0.6, m2: 2.5 }) : image;
}

export async function fit3x5(buf, { photo }) {
  const meta = await sharp(buf).metadata();
  if (photo) {
    const scale = Math.max(W / meta.width, H / meta.height);
    return sharpenIfUpscaled(sharp(buf).resize(W, H, { fit: "cover", position: sharp.strategy.attention }), scale)
      .jpeg({ quality: 92 })
      .toBuffer();
  }
  const scale = Math.min(W / meta.width, H / meta.height);
  const fg = await sharpenIfUpscaled(sharp(buf).resize({ width: W, height: H, fit: "inside" }), scale).toBuffer();
  const fm = await sharp(fg).metadata();
  return sharp({ create: { width: W, height: H, channels: 3, background: await edgeColor(buf) } })
    .composite([{ input: fg, left: Math.floor((W - fm.width) / 2), top: Math.floor((H - fm.height) / 2) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
