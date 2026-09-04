import { useState } from "react";
import { ScrollView, View } from "react-native";
import { PackageOpen, ShoppingCart } from "lucide-react-native";

import {
  BlockingOverlay,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
  SkeletonGrid,
  SkeletonList,
} from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  AdaptiveSheetTrigger,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Icon,
  Input,
  Progress,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@/components/ui";
import { AppError } from "@/core/errors";
import { useLayout } from "@/core/responsive";

const LONG_TEXT =
  "A deliberately long product name that has to wrap without pushing the layout sideways or clipping its own descenders on a narrow preview width.";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="h2">{title}</Text>
      <Separator />
      <View className="gap-3">{children}</View>
    </View>
  );
}

const TOKENS = [
  "bg-background",
  "bg-card",
  "bg-primary",
  "bg-secondary",
  "bg-muted",
  "bg-accent",
  "bg-success",
  "bg-warning",
  "bg-destructive",
] as const;

/**
 * Development-only gallery of the KISOK design system.
 *
 * Use it to check a token, a component state, or responsive behaviour in the
 * browser without building a whole feature. Open `/ui-lab` after
 * `pnpm web`. When you add a shared component, add it here too — this is how
 * the next agent discovers it exists.
 */
export function UiLabScreen() {
  const layout = useLayout();
  const [value, setValue] = useState("");
  const [tab, setTab] = useState("new");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="gap-8 p-6">
        <View className="gap-2">
          <Text variant="display">UI Lab</Text>
          <Text variant="caption">
            {layout.width}×{layout.height} · {layout.size} ·{" "}
            {layout.isPortrait ? "portrait" : "landscape"}
          </Text>
        </View>

        <Section title="Colour tokens">
          <View className="flex-row flex-wrap gap-2">
            {TOKENS.map((token) => (
              <View key={token} className="items-center gap-1">
                <View className={`h-14 w-24 rounded-lg border border-border ${token}`} />
                <Text variant="caption">{token}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Typography">
          <Text variant="display">Display</Text>
          <Text variant="h1">Heading 1</Text>
          <Text variant="h2">Heading 2</Text>
          <Text variant="h3">Heading 3</Text>
          <Text variant="lead">Lead paragraph</Text>
          <Text variant="body">Body text</Text>
          <Text variant="label">Label</Text>
          <Text variant="caption">Caption</Text>
          <Text variant="mono">A7K2M9</Text>
          <Text variant="body">{LONG_TEXT}</Text>
        </Section>

        <Section title="Buttons">
          <View className="flex-row flex-wrap gap-3">
            <Button>
              <Text>Primary</Text>
            </Button>
            <Button variant="secondary">
              <Text>Secondary</Text>
            </Button>
            <Button variant="outline">
              <Text>Outline</Text>
            </Button>
            <Button variant="ghost">
              <Text>Ghost</Text>
            </Button>
            <Button variant="destructive">
              <Text>Destructive</Text>
            </Button>
            <Button disabled>
              <Text>Disabled</Text>
            </Button>
          </View>
          <View className="flex-row flex-wrap items-center gap-3">
            <Button size="large">
              <Text>Large</Text>
            </Button>
            <Button size="compact" variant="secondary">
              <Text>Compact</Text>
            </Button>
            <Button size="icon" variant="outline" accessibilityLabel="Open cart">
              <Icon as={ShoppingCart} size={20} />
            </Button>
          </View>
        </Section>

        <Section title="Inputs">
          <Input
            label="Store email"
            placeholder="name@store.example"
            value={value}
            onChangeText={setValue}
          />
          <Input label="With hint" hint="Six characters, no I, O, 0 or 1." placeholder="A7K2M9" />
          <Input label="With error" errorMessage="That order number isn't valid." value="123" />
          <Input label="Disabled" editable={false} value="Read only" />
        </Section>

        <Section title="Badges">
          <View className="flex-row flex-wrap gap-2">
            <Badge>
              <Text>New</Text>
            </Badge>
            <Badge variant="primary">
              <Text>Preparing</Text>
            </Badge>
            <Badge variant="success">
              <Text>Ready</Text>
            </Badge>
            <Badge variant="warning">
              <Text>Low stock</Text>
            </Badge>
            <Badge variant="destructive">
              <Text>Cancelled</Text>
            </Badge>
            <Badge variant="outline">
              <Text>Outline</Text>
            </Badge>
          </View>
        </Section>

        <Section title="Card">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Product name</CardTitle>
              <CardDescription>Brand · Category</CardDescription>
            </CardHeader>
            <CardContent>
              <Text variant="body" tone="muted">
                {LONG_TEXT}
              </Text>
            </CardContent>
            <CardFooter>
              <Button size="compact">
                <Text>Add to cart</Text>
              </Button>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Media">
          <View className="flex-row gap-3">
            <AppImage uri={null} alt="Missing image fallback" className="h-28 w-28 rounded-lg" />
            <AppImage
              uri="https://invalid.example/not-a-real-image.png"
              alt="Failed image fallback"
              className="h-28 w-28 rounded-lg"
            />
          </View>
          <Text variant="caption">Both tiles show the fallback: no URI, and a failed fetch.</Text>
        </Section>

        <Section title="Progress and skeletons">
          <Progress value={35} accessibilityLabel="Example progress, 35 percent" />
          <Skeleton className="h-6 w-48" />
          <SkeletonList count={3} />
          <SkeletonGrid count={4} />
        </Section>

        <Section title="Tabs">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="new">
                <Text>New</Text>
              </TabsTrigger>
              <TabsTrigger value="preparing">
                <Text>Preparing</Text>
              </TabsTrigger>
              <TabsTrigger value="ready">
                <Text>Ready</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="new">
              <Text variant="body">New orders</Text>
            </TabsContent>
            <TabsContent value="preparing">
              <Text variant="body">Orders being prepared</Text>
            </TabsContent>
            <TabsContent value="ready">
              <Text variant="body">Orders ready for pickup</Text>
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Alerts and errors">
          <Alert title="Informational" description="Neutral message." />
          <Alert variant="success" title="Order submitted" description="Reference A7K2M9." />
          <Alert
            variant="warning"
            title="Saved in memory only"
            description="We couldn't write to storage."
          />
          <Alert
            variant="destructive"
            title="Out of stock"
            description="One item is no longer available."
          />
          <InlineError
            error={
              new AppError({
                kind: "unavailable",
                userMessage: "Some items are no longer available.",
              })
            }
          />
        </Section>

        <Section title="Overlays">
          <View className="flex-row flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Text>Open dialog</Text>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog title</DialogTitle>
                  <DialogDescription>Focus is trapped and back/escape closes it.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>

            <AdaptiveSheet>
              <AdaptiveSheetTrigger asChild>
                <Button variant="outline">
                  <Text>Open adaptive sheet</Text>
                </Button>
              </AdaptiveSheetTrigger>
              <AdaptiveSheetContent>
                <AdaptiveSheetHeader>
                  <AdaptiveSheetTitle>Adaptive surface</AdaptiveSheetTitle>
                  <AdaptiveSheetDescription>
                    Side panel in landscape, bottom sheet otherwise.
                  </AdaptiveSheetDescription>
                </AdaptiveSheetHeader>
                <View className="p-5">
                  <Text variant="body" tone="muted">
                    Side panel in landscape, bottom sheet otherwise. Resize the window to see it
                    switch.
                  </Text>
                </View>
              </AdaptiveSheetContent>
            </AdaptiveSheet>

            <Button variant="destructive" onPress={() => setConfirmOpen(true)}>
              <Text>Destructive confirm</Text>
            </Button>

            <Button
              variant="secondary"
              onPress={() => {
                setBlocking(true);
                setTimeout(() => setBlocking(false), 1500);
              }}
            >
              <Text>Blocking overlay</Text>
            </Button>
          </View>
        </Section>

        <Section title="Screen states">
          <View className="h-48 rounded-lg border border-border">
            <LoadingState />
          </View>
          <View className="h-56 rounded-lg border border-border">
            <EmptyState
              icon={PackageOpen}
              title="No products yet"
              description="Nothing in this category is available right now."
              action={{ label: "Browse all products", onPress: () => {} }}
            />
          </View>
          <View className="h-56 rounded-lg border border-border">
            <ErrorState
              error={
                new AppError({ kind: "network", userMessage: "We couldn't reach the network." })
              }
              onRetry={() => {}}
            />
          </View>
        </Section>
      </ScrollView>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove this item?"
        description="It will be taken out of the cart."
        confirmLabel="Remove"
        destructive
        onConfirm={() => setConfirmOpen(false)}
      />
      <BlockingOverlay visible={blocking} label="Submitting your order…" />
    </Screen>
  );
}
