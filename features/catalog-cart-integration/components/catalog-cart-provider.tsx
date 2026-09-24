import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui";
import { CONTENT_MAX_WIDTH } from "@/core/responsive";
import { QuickCartSheet, useCart } from "@/features/cart";

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

/** Browsing chrome owns its geometry; catalog content never pads around an overlay. */
export function CatalogCartProvider({ children }: CatalogCartProviderProps) {
  const cart = useCart();
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
      <View className="flex-1">
        <View className="min-h-0 flex-1">{children}</View>
        {browsing ? (
          <SafeAreaView
            edges={["bottom", "left", "right"]}
            className="border-t border-border/60 bg-background"
          >
            <View
              className="w-full flex-row items-center justify-between gap-4 self-center px-5 py-3 md:px-8"
              style={{ maxWidth: CONTENT_MAX_WIDTH }}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text variant="label">
                  {cart.totalQuantity > 0 ? "Your selections" : "Take your time"}
                </Text>
                <Text variant="caption" tone="muted">
                  {cart.totalQuantity > 0
                    ? `${cart.totalQuantity} ${cart.totalQuantity === 1 ? "item" : "items"} in your cart`
                    : "Explore the store. Your cart stays here."}
                </Text>
              </View>
              <CartAccessButton />
            </View>
          </SafeAreaView>
        ) : null}
      </View>
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
