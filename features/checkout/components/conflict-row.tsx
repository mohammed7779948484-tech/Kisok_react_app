import { View } from "react-native";

import { Text } from "@/components/ui";
import { customerLineIdentity, type CartLine } from "@/features/cart";

import type { StockConflictItem } from "../state/attempt-store";

/**
 * One stock-conflict row: the wire entry joined to the submission's cart
 * lines (D9). Feature-level because TWO consumers render it — the review
 * screen's conflict panel and the session-level recovery gate — so per the
 * design-system ownership rule it lives here rather than being copied into
 * each screen-local components/ directory.
 *
 * The join is case-insensitive on the uuid exactly like the RPC and T02's
 * normalization compare them. Multiple lines can share a variant (one per
 * option selection — the request merged them), so ALL matching captions
 * render, each on its own line; the product name they share renders once.
 * The CALLER owns which lines are passed: both consumers pass the locked
 * submission's lines (the review screen's flight lock / the recovery
 * replay's lock guarantee the lines are the submission context), so the
 * join can never show anything unconfirmed.
 *
 * Defensive by design: the server echoes the submitted variant_ids, so a
 * missed join means a payload the caller cannot explain — the id itself
 * renders, never a blank row (an empty Text is invisible on a shared
 * tablet). Requested/Available are WORDS and numbers, never colour alone.
 */
export function ConflictRow({ entry, lines }: { entry: StockConflictItem; lines: CartLine[] }) {
  const matches = lines.filter(
    (line) => line.variantId.toLowerCase() === entry.variant_id.toLowerCase(),
  );
  const title = matches[0]?.productDisplayName ?? entry.variant_id;
  return (
    <View className="gap-4 border-b border-warning/30 py-5 md:flex-row md:items-center">
      <View className="flex-1 gap-1">
        <Text variant="h3">{title}</Text>
        {matches.map((line) => (
          <Text key={line.lineId} variant="caption">
            {customerLineIdentity(line).caption}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-6">
        <View className="gap-1">
          <Text variant="caption" tone="muted">
            Requested
          </Text>
          <Text variant="h2" accessibilityLabel={`Requested ${entry.requested_quantity}`}>
            {entry.requested_quantity}
          </Text>
        </View>
        <View className="gap-1">
          <Text variant="caption" tone="muted">
            Available
          </Text>
          <Text variant="h2" accessibilityLabel={`Available ${entry.available_quantity}`}>
            {entry.available_quantity}
          </Text>
        </View>
      </View>
    </View>
  );
}
