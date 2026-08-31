import { FoundationPlaceholder } from "@/components/app/foundation-placeholder";

export default function PreparationHomeRoute() {
  return (
    <FoundationPlaceholder
      experience="Preparation"
      nextFeature="preparation"
      surfaces={[
        "Active workspace board (New / Preparing / Ready)",
        "Order details with allowed actions",
        "Store-day history",
      ]}
    />
  );
}
