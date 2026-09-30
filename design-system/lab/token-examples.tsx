import { View } from "react-native";

import { cn } from "@/core/utils";

import { useLayout, usePageGutter } from "../foundations/responsive";
import { Text } from "../primitives/text";
import { TOKENS } from "../theme/navigation-theme";
import { radius } from "../tokens/radii";
import { size } from "../tokens/sizing";
import { space } from "../tokens/spacing";
import { typeScale } from "../tokens/typography";
import { LabCaption, LabSection } from "./lab-section";

const COLOR_ROLES = [
  ["Background", "bg-background", "text-foreground", "background"],
  ["Card", "bg-card", "text-card-foreground", "card"],
  ["Muted", "bg-muted", "text-muted-foreground", "muted"],
  ["Primary", "bg-primary", "text-primary-foreground", "primary"],
  ["Secondary", "bg-secondary", "text-secondary-foreground", "secondary"],
  ["Accent", "bg-accent", "text-accent-foreground", "accent"],
  ["Accent soft", "bg-accent-soft", "text-foreground", "accentSoft"],
  ["Success", "bg-success", "text-success-foreground", "success"],
  ["Warning", "bg-warning", "text-warning-foreground", "warning"],
  ["Destructive", "bg-destructive", "text-destructive-foreground", "destructive"],
  ["Unavailable", "bg-unavailable", "text-primary-foreground", "unavailable"],
  ["Border", "bg-border", "text-foreground", "border"],
] as const;

const TYPE_ROLES = [
  ["display", "Product and page titles"],
  ["h1", "Section headings"],
  ["h2", "Panel headings"],
  ["title", "Card and row names"],
  ["lead", "Page descriptions"],
  ["body", "Body copy"],
  ["label", "Labels and actions"],
  ["meta", "Secondary lines"],
  ["caption", "Fine print"],
  ["eyebrow", "Overlines"],
  ["numeral", "Counts and facts"],
] as const;

export function TokenExamples() {
  return (
    <>
      <LabSection eyebrow="Theme" title="Colour roles">
        <View className="flex-row flex-wrap gap-3">
          {COLOR_ROLES.map(([label, background, foreground, token]) => (
            <View
              key={label}
              className={cn(
                "h-24 w-44 justify-end rounded-lg border border-border p-3",
                background,
              )}
            >
              <Text className={cn("font-sans-bold text-meta", foreground)}>{label}</Text>
              <Text className={cn("text-caption opacity-80", foreground)}>
                {TOKENS.light[token]}
              </Text>
            </View>
          ))}
        </View>
      </LabSection>

      <LabSection eyebrow="Tokens" title="Typography">
        <View className="gap-4">
          {TYPE_ROLES.map(([variant, use]) => (
            <View key={variant} className="flex-row flex-wrap items-baseline gap-x-6 gap-y-1">
              <View className="w-40">
                <LabCaption>{variant}</LabCaption>
                <Text variant="caption" tone="muted">
                  {use}
                </Text>
              </View>
              <Text
                variant={variant}
                className="min-w-0 flex-1"
                role={undefined}
                aria-level={undefined}
              >
                {variant === "numeral" ? "46" : "Choose a flavor for Float 3k"}
              </Text>
            </View>
          ))}
        </View>
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(typeScale).map(([name, step]) => (
            <View key={name} className="rounded-md border border-border bg-card px-3 py-2">
              <Text variant="caption" tone="muted">
                {`text-${name} · ${step.size}/${step.lineHeight}`}
              </Text>
            </View>
          ))}
        </View>
      </LabSection>

      <LabSection eyebrow="Tokens" title="Space, size and radius">
        <View className="gap-2">
          <LabCaption>Spacing (dp)</LabCaption>
          <View className="flex-row flex-wrap items-end gap-3">
            {Object.entries(space).map(([name, value]) => (
              <View key={name} className="items-center gap-1">
                <View className="bg-primary" style={{ width: Math.max(value, 1), height: 24 }} />
                <Text variant="caption" tone="muted">
                  {`${name} · ${value}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View className="gap-2">
          <LabCaption>Radius (dp)</LabCaption>
          <View className="flex-row flex-wrap gap-3">
            {Object.entries(radius)
              .filter(([name]) => name !== "full" && name !== "none")
              .map(([name, value]) => (
                <View
                  key={name}
                  className="h-20 w-24 items-center justify-center border border-border bg-card"
                  style={{ borderRadius: value }}
                >
                  <Text variant="caption" tone="muted">
                    {`${name} · ${value}`}
                  </Text>
                </View>
              ))}
          </View>
        </View>
        <View className="gap-2">
          <LabCaption>Control sizes (dp)</LabCaption>
          <View className="flex-row flex-wrap gap-2">
            {Object.entries(size).map(([name, value]) => (
              <View key={name} className="rounded-md border border-border bg-card px-3 py-2">
                <Text variant="caption" tone="muted">{`${name} · ${value}`}</Text>
              </View>
            ))}
          </View>
        </View>
      </LabSection>
    </>
  );
}

/** The live layout signals the responsive rules act on. */
export function ResponsiveExamples() {
  const layout = useLayout();
  const gutter = usePageGutter();
  const facts = [
    ["Window", `${Math.round(layout.width)} × ${Math.round(layout.height)}`],
    ["Size", layout.size],
    ["Orientation", layout.isPortrait ? "portrait" : "landscape"],
    ["Gutter", `${gutter}dp`],
  ] as const;
  return (
    <LabSection eyebrow="Foundations" title="Responsive">
      <View className="flex-row flex-wrap gap-3">
        {facts.map(([label, value]) => (
          <View key={label} className="min-w-40 gap-1 rounded-lg border border-border bg-card p-4">
            <LabCaption>{label}</LabCaption>
            <Text className="font-display text-display-xs">{value}</Text>
          </View>
        ))}
      </View>
      <Text variant="body" tone="muted">
        1280×800 landscape is the calibration viewport. Layouts split at the expanded size (1024+),
        grids take their column count from the width they are given, and every pressable keeps a
        48dp target.
      </Text>
    </LabSection>
  );
}
