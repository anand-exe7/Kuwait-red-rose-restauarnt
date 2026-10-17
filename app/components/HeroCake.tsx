/**
 * The hero cake.
 *
 * All motion is pure CSS transform on a single element (globals.css,
 * .cake-spin): the compositor can run it on every device without a repaint,
 * which keeps it smooth on mid-range phones where the earlier combo of sway
 * + pointer-tilt + bob was dropping frames.
 */
export default function HeroCake({ alt }: { alt: string }) {
  return (
    <span className="hero-cake-img relative block">
      <span className="cake-spin block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/cake-hd.webp"
          srcSet="/cake-hd-720.webp 720w, /cake-hd.webp 1100w"
          sizes="(min-width: 1024px) 34vw, (min-width: 640px) 40vw, 78vw"
          width={1100}
          height={1042}
          alt={alt}
          fetchPriority="high"
          decoding="async"
          className="block h-auto w-full"
        />
      </span>
    </span>
  );
}
