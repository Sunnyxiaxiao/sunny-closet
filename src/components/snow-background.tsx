"use client";

import { useEffect, useRef } from "react";

interface Flake {
  x: number;
  y: number;
  /** 半径（px） */
  r: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
  angle: number;
  spin: number;
}

/** 预先画好的雪花图案（❄ 形：六个分叉的枝），每片雪花按自己的大小、角度、透明度贴上去 */
const SPRITE_SIZE = 96;

function makeSprite(): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = SPRITE_SIZE;
  const ctx = sprite.getContext("2d")!;
  const c = SPRITE_SIZE / 2;
  const arm = SPRITE_SIZE * 0.44;
  ctx.translate(c, c);
  ctx.strokeStyle = "rgb(125, 170, 220)";
  ctx.lineCap = "round";
  ctx.lineWidth = SPRITE_SIZE * 0.055;
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((Math.PI / 3) * i);
    ctx.beginPath();
    // 主枝
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -arm);
    // 两对小分叉
    for (const [at, len] of [
      [0.45, 0.3],
      [0.72, 0.22],
    ]) {
      ctx.moveTo(0, -arm * at);
      ctx.lineTo(-arm * len, -arm * (at + len));
      ctx.moveTo(0, -arm * at);
      ctx.lineTo(arm * len, -arm * (at + len));
    }
    ctx.stroke();
    ctx.restore();
  }
  // 中心小六边形
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    ctx.lineTo(Math.sin(a) * arm * 0.16, -Math.cos(a) * arm * 0.16);
  }
  ctx.closePath();
  ctx.stroke();
  return sprite;
}

/**
 * 全站背景的雪花（❄ 形）飘落，边落边慢慢转。画在一张固定在屏幕上的 canvas 里，层级在所有内容后面（-z-10），
 * 点击、滚动都穿透过去，不挡任何东西；有底色的区块（页头、页脚、卡片图片）会盖住雪花。
 * 背景是白色，所以雪花用半透明的冰蓝色。系统开了“减少动态效果”时只显示静止的雪花；页面切到后台时暂停。
 */
export function SnowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let last = performance.now();
    const sprite = makeSprite();

    const makeFlake = (anywhere: boolean): Flake => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -20,
      r: 7 + Math.random() * 9,
      speed: 20 + Math.random() * 30,
      drift: 10 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.4,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.8,
    });

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 雪花数量跟屏幕面积走：手机约 18 片，大屏最多 55 片
      const count = Math.min(55, Math.round((width * height) / 18000));
      flakes = Array.from({ length: count }, (_, i) => flakes[i] ?? makeFlake(true));
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        ctx.drawImage(sprite, -f.r, -f.r, f.r * 2, f.r * 2);
        ctx.restore();
      }
    }

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      for (const [i, f] of flakes.entries()) {
        f.phase += dt * 0.8;
        f.y += f.speed * dt;
        f.x += Math.sin(f.phase) * f.drift * dt;
        f.angle += f.spin * dt;
        if (f.y > height + 20 || f.x < -20 || f.x > width + 20) flakes[i] = makeFlake(false);
      }
      draw();
      frame = requestAnimationFrame(tick);
    }

    function onVisibility() {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduceMotion) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

    resize();
    draw();
    if (!reduceMotion) frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
