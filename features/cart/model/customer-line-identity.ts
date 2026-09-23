import type { CartLine } from "./cart-line.schema";

type LineIdentity = Pick<CartLine, "productDisplayName" | "variantLabel" | "optionSelections">;

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** One customer-facing identity for cart previews, conflicts and submitted snapshots. */
export function customerLineIdentity(line: LineIdentity) {
  const title = line.productDisplayName.trim();
  const options = line.optionSelections.map((option) => option.optionValueLabel.trim());
  const variant = line.variantLabel.trim();
  const redundantVariant = [title, ...options, options.join(" · ")].some(
    (label) => normalized(label) === normalized(variant),
  );
  const captions = [...options];
  if (variant && !redundantVariant) captions.unshift(variant);
  return { title, caption: [...new Set(captions)].join(" · ") };
}
