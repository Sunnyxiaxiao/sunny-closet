import Image from "next/image";

export function StyleImage({
  src,
  alt,
  sizes,
  priority,
}: {
  src: string | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className="relative aspect-[3/5] w-full overflow-hidden bg-neutral-100">
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-4xl text-neutral-300">❄</div>
      )}
    </div>
  );
}
