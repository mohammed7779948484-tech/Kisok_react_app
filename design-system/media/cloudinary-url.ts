import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { blur } from "@cloudinary/url-gen/actions/effect";
import { fill, limitFit } from "@cloudinary/url-gen/actions/resize";
import { CloudinaryImage } from "@cloudinary/url-gen/assets/CloudinaryImage";
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format";
import { autoGravity } from "@cloudinary/url-gen/qualifiers/gravity";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";

/**
 * Size presets, in device pixels (tablets render at ~2x). Every preset asks
 * Cloudinary for `q_auto` and `f_auto`, so a card downloads a right-sized
 * WebP/AVIF instead of the original upload.
 *
 *   thumbnail  a square crop for cover-fit option and gallery thumbnails
 *   packshot   a small fitted rendition for contain-fit rows (cart, orders) —
 *              never cropped, so a tall bottle keeps its label
 *   card       product packaging on cards — fitted, never upscaled
 *   detail     the Product Stage image
 *   cover      category and brand imagery that fills its frame
 *   backdrop   a tiny, heavily blurred copy used as an ambient fill behind a
 *              fitted image, so the frame is full without cropping the product
 */
export type CloudinaryPreset = "thumbnail" | "packshot" | "card" | "detail" | "cover" | "backdrop";

/** A snapshot media record, or a bare `secure_url` (cart and order lines keep only the URL). */
export type CloudinarySource = { publicId: string; secureUrl: string } | string | null | undefined;

const PRESETS: Record<CloudinaryPreset, (image: CloudinaryImage) => CloudinaryImage> = {
  thumbnail: (image) => image.resize(fill().width(200).height(200).gravity(autoGravity())),
  packshot: (image) => image.resize(limitFit().width(240).height(240)),
  card: (image) => image.resize(limitFit().width(720).height(720)),
  detail: (image) => image.resize(limitFit().width(1400).height(1400)),
  cover: (image) => image.resize(fill().width(1280).height(900).gravity(autoGravity())),
  backdrop: (image) => image.resize(limitFit().width(96).height(96)).effect(blur().strength(1200)),
};

/**
 * `https://res.cloudinary.com/<cloud>/image/upload/[transforms/][v123/]<public_id>.<ext>`
 * Segments are skipped only up to the version marker an upload URL always has,
 * so a folder that happens to look like a transform (`my_images/`) survives.
 */
const CLOUDINARY_URL =
  /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:(?:[^/]+\/)*?v(\d+)\/)?(.+?)(?:\.[a-z0-9]{2,5})?$/i;

const cache = new Map<string, string>();

/**
 * A size- and quality-appropriate Cloudinary URL for `source`.
 *
 * Anything that is not a Cloudinary delivery URL is returned unchanged, so a
 * non-Cloudinary image still renders — just unoptimised.
 */
export function cloudinaryImageUrl(
  source: CloudinarySource,
  preset: CloudinaryPreset,
): string | null {
  if (!source) return null;
  const secureUrl = typeof source === "string" ? source : source.secureUrl;
  const match = CLOUDINARY_URL.exec(secureUrl);
  if (!match) return secureUrl;

  const cloudName = match[1] ?? "";
  // The upload version busts CDN caches when an asset is replaced; keep it.
  const version = match[2];
  const publicId =
    typeof source === "string" ? decodeURIComponent(match[3] ?? "") : source.publicId;
  if (!cloudName || !publicId) return secureUrl;

  const key = `${cloudName}|${version ?? ""}|${publicId}|${preset}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const image = new CloudinaryImage(publicId, { cloudName }, { analytics: false, secure: true });
  if (version) image.setVersion(version);
  const url = PRESETS[preset](image)
    .delivery(quality(autoQuality()))
    .delivery(format(autoFormat()))
    .toURL();
  cache.set(key, url);
  return url;
}
