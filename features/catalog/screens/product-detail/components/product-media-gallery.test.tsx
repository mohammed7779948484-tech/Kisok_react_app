import { act, renderWithProviders, screen, userEvent } from "@/core/testing";

import type { CatalogMedia } from "../../../model/catalog-view";

import { ProductMediaGallery } from "./product-media-gallery";

// AppImage's fallback icon renders a lucide icon; stub it so the empty-media
// fallback path renders without the SVG machinery.
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

/**
 * Behaviour for the screen-local Product Media Gallery (AC-07, Design
 * decisions 9 and 12).
 *
 * The component is PRESENTATIONAL: it receives the media to show (the model's
 * derived `variant.media`, whose variant→product-cover fallback is already
 * applied), the active media id, and its callback, and reports interactions
 * upward — no fetching, no store, no router. The owning screen owns the
 * selection state (Design decision 3: selected image is screen-local React
 * state).
 *
 * It renders AppImage plus plain pressables (no FlashList), so it needs
 * neither the API-seam mock, nor the router mock, nor fake timers — which is
 * itself part of the presentational-purity proof.
 */
const galleryAlt = "Studio Kettle — Matte Black Edition";

const mediaSet = [
  {
    mediaAssetId: "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1",
    publicId: "products/kettle-matte-1",
    secureUrl: "https://res.cloudinary.com/kisok/image/upload/kettle-matte-1.png",
  },
  {
    mediaAssetId: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
    publicId: "products/kettle-matte-2",
    secureUrl: "https://res.cloudinary.com/kisok/image/upload/kettle-matte-2.png",
  },
  {
    mediaAssetId: "b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3",
    publicId: "products/kettle-matte-3",
    secureUrl: "https://res.cloudinary.com/kisok/image/upload/kettle-matte-3.png",
  },
] as const satisfies readonly CatalogMedia[];

const singleMedia = [
  {
    mediaAssetId: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
    publicId: "products/kettle-rouge",
    secureUrl: "https://res.cloudinary.com/kisok/image/upload/kettle-rouge.png",
  },
] as const satisfies readonly CatalogMedia[];

/** The rendered element shape the secure-URL and latch assertions read. */
type RenderedImageElement = {
  props: {
    source?: readonly { uri?: string }[];
    onError?: (event: { nativeEvent: { error?: unknown } }) => void;
  };
};

/**
 * The secure URL the rendered gallery image actually displays. Read from the
 * real rendered expo-image output (its `source` prop) — the picture on screen
 * IS the behaviour, not a mock's internals.
 */
function displayedImageUri(element: RenderedImageElement): string | undefined {
  const source = element.props.source;
  return Array.isArray(source) ? source[0]?.uri : undefined;
}

describe("ProductMediaGallery", () => {
  it("renders the active media image without a thumbnail strip when there is a single image", async () => {
    await renderWithProviders(
      <ProductMediaGallery
        media={singleMedia}
        alt={galleryAlt}
        activeMediaAssetId={singleMedia[0].mediaAssetId}
        onSelectMedia={jest.fn()}
      />,
    );

    // One large image, named for what it shows; a single image needs no strip.
    const image = screen.getByLabelText(galleryAlt);
    expect(displayedImageUri(image)).toBe(singleMedia[0].secureUrl);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a thumbnail strip for multiple images with the active one selected", async () => {
    await renderWithProviders(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId={mediaSet[0].mediaAssetId}
        onSelectMedia={jest.fn()}
      />,
    );

    // The large image announces its position in the set…
    expect(screen.getByLabelText(`${galleryAlt}, image 1 of 3`)).toBeOnTheScreen();
    expect(displayedImageUri(screen.getByLabelText(`${galleryAlt}, image 1 of 3`))).toBe(
      mediaSet[0].secureUrl,
    );

    // …and every image is reachable as a named, touch-sized thumbnail button
    // whose selection is announced.
    expect(
      screen.getByRole("button", { name: `${galleryAlt} image 1`, selected: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: `${galleryAlt} image 2`, selected: false }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: `${galleryAlt} image 3`, selected: false }),
    ).toBeOnTheScreen();
  });

  it("reports the pressed thumbnail and follows the new active id on re-render", async () => {
    const onSelectMedia = jest.fn();
    const user = userEvent.setup();

    const { rerender } = await renderWithProviders(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId={mediaSet[0].mediaAssetId}
        onSelectMedia={onSelectMedia}
      />,
    );

    // Controlled: the press is REPORTED; the owning screen decides and hands
    // the new active id back through props.
    await user.press(screen.getByRole("button", { name: `${galleryAlt} image 3` }));

    expect(onSelectMedia).toHaveBeenCalledTimes(1);
    expect(onSelectMedia).toHaveBeenCalledWith(mediaSet[2].mediaAssetId);

    await rerender(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId={mediaSet[2].mediaAssetId}
        onSelectMedia={onSelectMedia}
      />,
    );

    expect(screen.getByLabelText(`${galleryAlt}, image 3 of 3`)).toBeOnTheScreen();
    expect(displayedImageUri(screen.getByLabelText(`${galleryAlt}, image 3 of 3`))).toBe(
      mediaSet[2].secureUrl,
    );
    expect(
      screen.getByRole("button", { name: `${galleryAlt} image 1`, selected: false }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: `${galleryAlt} image 3`, selected: true }),
    ).toBeOnTheScreen();
  });

  it("falls back to the shared image fallback when the media set is empty", async () => {
    await renderWithProviders(
      <ProductMediaGallery
        media={[]}
        alt={galleryAlt}
        activeMediaAssetId={null}
        onSelectMedia={jest.fn()}
      />,
    );

    // The gallery's last honest fallback: AppImage's shared slot keeps the
    // image surface and its layout instead of collapsing.
    expect(screen.getByRole("image", { name: galleryAlt })).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("defaults the active image to the first media when the active id matches none", async () => {
    await renderWithProviders(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId="d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1"
        onSelectMedia={jest.fn()}
      />,
    );

    // A stale active id (e.g. a variant switch mid-render) degrades to the
    // first media of the set rather than to nothing.
    expect(screen.getByLabelText(`${galleryAlt}, image 1 of 3`)).toBeOnTheScreen();
    expect(displayedImageUri(screen.getByLabelText(`${galleryAlt}, image 1 of 3`))).toBe(
      mediaSet[0].secureUrl,
    );
  });

  it("resets a latched image failure when the active media changes — the remount-by-URI guarantee", async () => {
    // Design decision 12 / the plan's named risk: "Product Detail image
    // failure state leaks between selected variants". AppImage latches a
    // `failed` useState when a URI fails to load and keeps rendering its
    // shared fallback until the component REMOUNTS. The gallery keys the
    // large image by its resolved secure URL precisely so a new selection
    // gets a fresh AppImage instance — a 404 on one image must not blank the
    // next one the customer picks.
    const { rerender } = await renderWithProviders(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId={mediaSet[0].mediaAssetId}
        onSelectMedia={jest.fn()}
      />,
    );

    // Latch the failure on the FIRST image, exactly as a real load failure
    // would: the rendered host's onError is expo-image's own handler, fed the
    // native-event shape it unwraps before calling AppImage's onError (which
    // latches the failure state). Runs inside act.
    const firstImage = screen.getByLabelText(`${galleryAlt}, image 1 of 3`) as RenderedImageElement;
    await act(async () => {
      firstImage.props.onError?.({ nativeEvent: { error: new Error("load failed") } });
    });

    // The failure latched — the slot now renders the shared fallback, not a
    // source. (This proves the onError call actually reached AppImage's
    // state; without it the rest of the test would prove nothing.)
    expect(displayedImageUri(screen.getByLabelText(`${galleryAlt}, image 1 of 3`))).toBeUndefined();

    // The customer picks the second image (the owning screen hands the new
    // active id back through props — the controlled callback path).
    await rerender(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId={mediaSet[1].mediaAssetId}
        onSelectMedia={jest.fn()}
      />,
    );

    // The remount-by-URI key gives the second image a FRESH AppImage: its
    // secure URL displays. Without the `key`, the latched `failed` state
    // would persist on the same instance and keep the fallback on screen —
    // this assertion is exactly what would fail (see the reasoning in the
    // worklog remediation entry).
    expect(screen.getByLabelText(`${galleryAlt}, image 2 of 3`)).toBeOnTheScreen();
    expect(displayedImageUri(screen.getByLabelText(`${galleryAlt}, image 2 of 3`))).toBe(
      mediaSet[1].secureUrl,
    );
  });

  it("follows new props on re-render — presentational, never its own data source", async () => {
    await renderWithProviders(
      <ProductMediaGallery
        media={mediaSet}
        alt={galleryAlt}
        activeMediaAssetId={mediaSet[0].mediaAssetId}
        onSelectMedia={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(`${galleryAlt}, image 1 of 3`)).toBeOnTheScreen();

    // A different media set and a different name: the gallery is a projection
    // of its props, with no internal fetching or caching.
    const otherAlt = "Café Crème — Signature roast";

    await renderWithProviders(
      <ProductMediaGallery
        media={singleMedia}
        alt={otherAlt}
        activeMediaAssetId={singleMedia[0].mediaAssetId}
        onSelectMedia={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(otherAlt)).toBeOnTheScreen();
    expect(displayedImageUri(screen.getByLabelText(otherAlt))).toBe(singleMedia[0].secureUrl);
    expect(screen.queryByLabelText(`${galleryAlt}, image 1 of 3`)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
