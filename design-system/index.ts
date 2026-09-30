/**
 * The KISOK design system — the one import for shared UI.
 *
 *   theme        colour roles, fonts, navigation theme
 *   tokens       type, space, size, radius, motion, layout scales
 *   foundations  responsive, touch-target, accessibility and motion rules
 *   primitives   atoms (Text, Button, Input, Badge, Checkbox…)
 *   composites   domain-neutral interactions (dialogs, sheets, search, stepper)
 *   feedback     loading, empty, error, offline and status messages
 *   layout       Screen, containers, grids, split and sticky regions
 *   media        AppImage and framed media
 *   patterns     recurring page shapes (headings, breadcrumb, result toolbar)
 *
 * Nothing here knows about products, carts or orders; those shapes live in
 * their features. Inside the design system, import by relative path, never
 * through this barrel.
 */
export * from "./theme";
export * from "./tokens";
export * from "./foundations";
export * from "./primitives";
export * from "./composites";
export * from "./feedback";
export * from "./layout";
export * from "./media";
export * from "./patterns";
