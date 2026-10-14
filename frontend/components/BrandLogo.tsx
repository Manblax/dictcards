import Image from "next/image";

export default function BrandLogo({ size = 44 }: { size?: 44 | 64 }) {
  return (
    <Image
      src="/dictcards.svg"
      alt="DictCards"
      width={size}
      height={size}
      loading="eager"
      unoptimized
      className="shrink-0"
    />
  );
}
