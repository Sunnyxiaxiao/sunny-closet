import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Fetch storefront routes on click, not for every visible card, filter or navigation icon. */
export default function StorefrontLink(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} />;
}
