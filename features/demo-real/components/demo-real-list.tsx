import { View } from "react-native";

import { Card, CardContent, Text } from "@/components/ui";
import type { DemoRealItem } from "../schemas/demo-real-schema";

/**
 * Presentational only: it receives data and reports interactions upward.
 *
 * It must not fetch, must not read a store, and must not import the Supabase
 * client. Keeping components dumb is what makes them testable without a
 * provider tree and reusable across screens.
 *
 * Use design-system components and semantic token classes — never a raw hex
 * colour or an inline dimension that should be a token.
 */
export type DemoRealListProps = {
  items: DemoRealItem[];
  onSelect?: (item: DemoRealItem) => void;
};

export function DemoRealList({ items, onSelect }: DemoRealListProps) {
  return (
    <View className="gap-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent
            className="pt-4"
            accessibilityRole={onSelect ? "button" : undefined}
            onTouchEnd={onSelect ? () => onSelect(item) : undefined}
          >
            <Text variant="body">{item.label}</Text>
          </CardContent>
        </Card>
      ))}
    </View>
  );
}
