import { useLocalSearchParams } from "expo-router";

import { BrandDetailScreen } from "@/features/catalog";

/**
 * Route only. Adding a file here is the whole registration step — there is no
 * central route table to edit, which is what keeps parallel feature work from
 * conflicting.
 *
 * The route and its screen are named independently on purpose: this file's name
 * is a URL segment, the screen's name says what it shows. `index.tsx` rendering
 * `BrandDetailScreen` is the normal case, not an exception.
 *
 * Keep this file thin: no data loading, no state, no business logic. If you need
 * route params, read them here with `useLocalSearchParams` and pass them to the
 * screen as props.
 */
export default function BrandDetailRoute() {
  // Flat query-param route (plan Design decision 4): the detail id arrives as
  // /brand-detail?brandId=…, read here and handed to the screen as a prop.
  const { brandId } = useLocalSearchParams<{ brandId: string }>();

  return <BrandDetailScreen brandId={brandId} />;
}
