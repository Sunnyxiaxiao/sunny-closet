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
    <div className="relative aspect-square w-full overflow-hidden bg-brand-50">
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-4xl text-brand-200">❄</div>
      )}
    </div>
  );
}
