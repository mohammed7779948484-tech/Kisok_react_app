import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { HeaderAction } from "@/design-system";
import { QuickCartSheet } from "@/features/cart";

import { CartAccessButton } from "./cart-access-button";
import { QuickCartContext, type QuickCartContextValue } from "./quick-cart-context";

export type CatalogCartProviderProps = { children: React.ReactNode };
const CATALOG_BROWSING_ROUTES = new Set([
  "/",
  "/products",
  "/brands",
  "/brand-detail",
  "/categories",
  "/category-detail",
  "/search",
  "/product-detail",
]);

/**
 * Owns cart access while browsing: it places the cart button in the catalog
 * chrome's header action slot on browsing routes, and hosts the Quick Cart.
 * The chrome owns where the slot sits; this provider only fills it.
 */
export function CatalogCartProvider({ children }: CatalogCartProviderProps) {
  const [open, setOpen] = useState(false);
  const [addedLineId, setAddedLineId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const browsing = CATALOG_BROWSING_ROUTES.has(pathname);
  useEffect(() => {
    setOpen(false);
    setAddedLineId(null);
  }, [pathname]);
  const openQuickCart = useCallback((lineId?: string) => {
    setAddedLineId(lineId ?? null);
    setOpen(true);
  }, []);
  const closeQuickCart = useCallback(() => setOpen(false), []);
  const contextValue = useMemo<QuickCartContextValue>(
    () => ({ open, openQuickCart, closeQuickCart }),
    [open, openQuickCart, closeQuickCart],
  );
  return (
    <QuickCartContext.Provider value={contextValue}>
      <View className="flex-1">{children}</View>
      {/* The cart lives in the catalog chrome's header action slot while
          browsing; the chrome renders the slot, this provider fills it. */}
      {browsing ? (
        <HeaderAction name="catalog-cart-access">
          <CartAccessButton />
        </HeaderAction>
      ) : null}
      <QuickCartSheet
        open={open && browsing}
        addedLineId={addedLineId}
        onOpenChange={setOpen}
        onViewFullCart={() => {
          setOpen(false);
          router.push("/cart");
        }}
      />
    </QuickCartContext.Provider>
  );
}
