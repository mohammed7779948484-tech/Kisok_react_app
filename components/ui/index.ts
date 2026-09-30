/**
 * Compatibility re-export: shared UI moved to `@/design-system`. Kept only so
 * existing test imports resolve; production code imports `@/design-system`.
 */
export * from "@/design-system/primitives";
export * from "@/design-system/composites";
export { Alert, AlertDescription, AlertTitle, alertVariants } from "@/design-system/feedback";
export type { AlertProps } from "@/design-system/feedback";
