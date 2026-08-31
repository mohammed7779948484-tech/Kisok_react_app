import { FoundationPlaceholder } from "@/components/app/foundation-placeholder";

export default function CustomerHomeRoute() {
  return (
    <FoundationPlaceholder
      experience="Customer"
      nextFeature="catalog"
      surfaces={[
        "Home discovery",
        "All products, brands, categories",
        "Search",
        "Product detail with variant/option selection",
        "Cart and adaptive cart sheet",
        "Order review, submission, and success",
      ]}
    />
  );
}
