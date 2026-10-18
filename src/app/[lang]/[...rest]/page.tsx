import { notFound } from "next/navigation";

/** 没有对应页面的地址都显示本语言的 404 页 */
export default function CatchAll() {
  notFound();
}
