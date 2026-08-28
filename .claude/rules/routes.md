---
paths:
  - "app/**"
---

# Expo Router routes

Route files are **routing and composition only**. ESLint blocks Supabase,
Zustand, and TanStack Query imports here.

A route should look like this:

```tsx
import { CatalogScreen } from "@/features/catalog";

export default function CatalogRoute() {
  return <CatalogScreen />;
}
```

With params:

```tsx
import { useLocalSearchParams } from "expo-router";
import { ProductDetailScreen } from "@/features/catalog";

export default function ProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductDetailScreen productId={id} />;
}
```

## Rules

- Adding a file here is the **whole** registration step. There is no central
  route table to edit — that is what keeps parallel feature work conflict-free.
- Put a route in the group matching its role: `(customer)/` or `(preparation)/`.
- Access is declared with `<Stack.Protected guard={…}>` in `app/_layout.tsx`.
  This is **UX protection only** — Supabase RLS is the real boundary. Never rely
  on a route guard for security.
- Development-only surfaces belong in `app/(dev)/`, which is guarded by `__DEV__`
  and unreachable in production. Never link to it from a customer screen.
- Do not add business logic, data loading, or state here. If a route file is
  growing, the logic belongs in the feature's screen.
