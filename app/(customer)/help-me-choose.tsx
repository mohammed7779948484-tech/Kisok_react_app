import { useLocalSearchParams } from "expo-router";

import { HelpMeChooseScreen } from "@/features/catalog";

/**
 * Route only: Help Me Choose, optionally opened already scoped to a category
 * or a brand (from that page's entry point).
 */
export default function HelpMeChooseRoute() {
  const { categoryId, brandId } = useLocalSearchParams<{
    categoryId?: string;
    brandId?: string;
  }>();
  return <HelpMeChooseScreen categoryId={categoryId} brandId={brandId} />;
}
