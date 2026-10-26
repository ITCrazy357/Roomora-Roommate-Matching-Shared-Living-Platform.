import type { ImageLoaderProps } from "next/image";

export function isLocalPublicImage(src: string) {
  return /^\/images\/[a-zA-Z0-9_/-]+\.(?:webp|avif|png|jpe?g)$/.test(src);
}

export function isPublicCloudinaryImage(src: string) {
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/[^/]+\/image\/upload\/(?!s--)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// Only public Cloudinary delivery URLs go through this loader. Authenticated
// message/proof/receipt URLs retain their existing API authorization path.
export function publicImageLoader({ src, width, quality }: ImageLoaderProps) {
  if (!isPublicCloudinaryImage(src)) return src;
  const target = Math.max(1, Math.min(1600, Math.round(width)));
  const q = Math.max(1, Math.min(100, Math.round(quality ?? 75)));
  return src.replace(
    "/image/upload/",
    `/image/upload/f_auto,q_${q},c_limit,w_${target}/`,
  );
}
