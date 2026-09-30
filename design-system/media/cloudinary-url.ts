import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { blur } from "@cloudinary/url-gen/actions/effect";
import { fill, limitFit } from "@cloudinary/url-gen/actions/resize";
import { CloudinaryImage } from "@cloudinary/url-gen/assets/CloudinaryImage";
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format";
import { autoGravity } from "@cloudinary/url-gen/qualifiers/gravity";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";

import { createLogger } from "@/core/logging";

const log = createLogger("media.cloudinary");

/**
 * The KISOK media contract, in device pixels (tablets render at ~2x). Every
 * preset asks Cloudinary for `q_auto` and `f_auto`.
 *
 *   card      product cards — `limitFit` 720×720, shown `contain`, never cropped
 *   detail    Product Detail — `limitFit` 1400×1400, shown `contain`
 *   row       cart, order and option rows, thumbnails, logos in chrome —
 *             `limitFit` 240×240, shown `contain`
 *   cover     category and editorial heroes — `fill` + auto gravity; cropping
 *             is acceptable because the image is atmosphere, not a product
 *   backdrop  a tiny, heavily blurred copy for decorative ambient fills
 *
 * Packaging is never cropped to fill a frame: products always use a
 * `limitFit` preset.
 */
export type CloudinaryPreset = "card" | "detail" | "row" | "cover" | "backdrop";

/** A snapshot media record, or a bare `secure_url` (cart and order lines keep only the URL). */
export type CloudinarySource = { publicId: string; secureUrl: string } | string | null | undefined;

const PRESETS: Record<CloudinaryPreset, (image: CloudinaryImage) => CloudinaryImage> = {
  card: (image) => image.resize(limitFit().width(720).height(720)),
  detail: (image) => image.resize(limitFit().width(1400).height(1400)),
  row: (image) => image.resize(limitFit().width(240).height(240)),
  cover: (image) => image.resize(fill().width(1280).height(900).gravity(autoGravity())),
  backdrop: (image) => image.resize(limitFit().width(96).height(96)).effect(blur().strength(1200)),
};

/**
 * `https://res.cloudinary.com/<cloud>/image/upload/<rest>` — only plain image
 * uploads are re-transformed; anything else is delivered as stored.
 */
const UPLOAD_URL = /^https:\/\/res\.cloudinary\.com\/([^/?#]+)\/image\/upload\/([^?#]+)$/i;
const VERSION_SEGMENT = /^v\d+$/;
/** A transformation segment: comma-joined `x_y` parameters (`c_fill,w_200`). */
const TRANSFORM_SEGMENT = /^(?:[a-z]{1,3}_[^/,]*)(?:,[a-z]{1,3}_[^/,]*)*$/;
const EXTENSION = /\.[a-z0-9]{2,5}$/i;

type DeliveryReference = { cloudName: string; version?: string; publicId: string };

/**
 * What the delivery URL itself says the asset is: cloud, version, and the
 * public id as its path (without the format extension).
 *
 * The path is only trusted when it is unambiguous: after a `v<digits>`
 * segment, or when no segment before it looks like a transformation.
 */
function parseDeliveryUrl(secureUrl: string): DeliveryReference | null {
  const match = UPLOAD_URL.exec(secureUrl);
  if (!match) return null;
  const cloudName = match[1] ?? "";
  const segments = (match[2] ?? "").split("/").filter(Boolean);

  const versionIndex = segments.findIndex((segment) => VERSION_SEGMENT.test(segment));
  let version: string | undefined;
  let idSegments: string[];
  if (versionIndex >= 0) {
    version = segments[versionIndex]?.slice(1);
    idSegments = segments.slice(versionIndex + 1);
  } else if (segments.some((segment) => TRANSFORM_SEGMENT.test(segment))) {
    return null;
  } else {
    idSegments = segments;
  }

  const path = idSegments.join("/").replace(EXTENSION, "");
  let publicId: string;
  try {
    publicId = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!cloudName || !publicId) return null;
  return { cloudName, version, publicId };
}

const normalizeId = (value: string) =>
  value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(EXTENSION, "");

/**
 * Which public id to transform. The delivery URL is the asset Cloudinary
 * actually serves, so it wins: some legacy records carry a `publicId` from
 * before the asset was moved (`tobacco_store_products/Geekbar/abc` while the
 * URL serves `media/abc`), and building a URL from that stale id would 404.
 */
function resolveReference(source: NonNullable<CloudinarySource>): DeliveryReference | null {
  const secureUrl = typeof source === "string" ? source : source.secureUrl;
  const delivered = parseDeliveryUrl(secureUrl);
  if (!delivered || typeof source === "string") return delivered;

  const stored = normalizeId(source.publicId);
  if (stored && stored !== delivered.publicId && !mismatchLogged.has(stored)) {
    mismatchLogged.add(stored);
    log.debug("Stored publicId disagrees with its secure_url; using the delivered path", {
      publicId: stored,
      delivered: delivered.publicId,
    });
  }
  return delivered;
}

const mismatchLogged = new Set<string>();
const cache = new Map<string, string>();

/**
 * A size- and quality-appropriate Cloudinary URL for `source`, or null when
 * there is no image.
 *
 * Anything that is not a plain Cloudinary image upload URL is returned
 * unchanged, so it still renders — just unoptimised.
 */
export function cloudinaryImageUrl(
  source: CloudinarySource,
  preset: CloudinaryPreset,
): string | null {
  if (!source) return null;
  const secureUrl = typeof source === "string" ? source : source.secureUrl;
  if (!secureUrl) return null;

  const cacheKey = `${preset}|${secureUrl}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const reference = resolveReference(source);
  if (!reference) return secureUrl;

  const image = new CloudinaryImage(
    reference.publicId,
    { cloudName: reference.cloudName },
    { analytics: false, secure: true },
  );
  // The upload version busts CDN caches when an asset is replaced; keep it.
  if (reference.version) image.setVersion(reference.version);
  const url = PRESETS[preset](image)
    .delivery(quality(autoQuality()))
    .delivery(format(autoFormat()))
    .toURL();
  cache.set(cacheKey, url);
  return url;
}
