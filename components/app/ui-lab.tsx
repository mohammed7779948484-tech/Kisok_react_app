import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Check, PackageOpen, ShoppingCart } from "lucide-react-native";

import {
  BlockingOverlay,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
  OfflineNotice,
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
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  AspectRatio,
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
  FormField,
  Icon,
  Input,
  InputControl,
  Label,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Separator,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { AppError } from "@/core/errors";
import { useLayout } from "@/core/responsive";

const LONG_TEXT =
  "A deliberately long product name that wraps cleanly without pushing the layout sideways or clipping at a narrow preview width.";

const COLOR_TOKENS = [
  ["Background", "bg-background", "text-foreground"],
  ["Card", "bg-card", "text-card-foreground"],
  ["Popover", "bg-popover", "text-popover-foreground"],
  ["Primary", "bg-primary", "text-primary-foreground"],
  ["Secondary", "bg-secondary", "text-secondary-foreground"],
  ["Muted", "bg-muted", "text-muted-foreground"],
  ["Accent", "bg-accent", "text-accent-foreground"],
  ["Success", "bg-success", "text-success-foreground"],
  ["Warning", "bg-warning", "text-warning-foreground"],
  ["Destructive", "bg-destructive", "text-destructive-foreground"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-4">
      <Text variant="h2">{title}</Text>
      <Separator />
      <View className="gap-4">{children}</View>
    </View>
  );
}

export function UiLabScreen() {
  const layout = useLayout();
  const [input, setInput] = useState("");
  const [tab, setTab] = useState("new");
  const [radio, setRadio] = useState("customer");
  const [toggle, setToggle] = useState(false);
  const [group, setGroup] = useState<string[]>(["available"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="gap-12 p-6 md:p-10">
        <View className="overflow-hidden rounded-xl border border-primary/20 bg-primary">
          <View className="gap-2 p-7 md:p-10">
            <Text variant="display" className="text-primary-foreground" accessibilityRole="header">
              KISOK foundation
            </Text>
            <Text variant="body" className="text-primary-foreground/80">
              {layout.width} x {layout.height} · {layout.size} ·{" "}
              {layout.isPortrait ? "portrait" : "landscape"}
            </Text>
          </View>
          <View className="bg-accent px-7 py-3 md:px-10">
            <Text variant="label" className="text-accent-foreground">
              Source-level component catalog
            </Text>
          </View>
        </View>

        <Section title="Semantic color">
          <View className="flex-row flex-wrap gap-3">
            {COLOR_TOKENS.map(([label, background, foreground]) => (
              <View
                key={label}
                className={`w-36 gap-3 rounded-md border border-border p-4 ${background}`}
              >
                <Text variant="label" className={foreground}>
                  {label}
                </Text>
                <Text variant="caption" className={foreground}>
                  {background}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Typography">
          <Text variant="display">Display</Text>
          <Text variant="h1">Heading one</Text>
          <Text variant="h2">Heading two</Text>
          <Text variant="h3">Heading three</Text>
          <Text variant="lead">Lead text gives an introduction room to breathe.</Text>
          <Text variant="body">Body text remains readable at tablet distance.</Text>
          <Text variant="label">Field and control label</Text>
          <Text variant="caption" tone="muted">
            Supporting caption
          </Text>
          <Text variant="mono">A7K2M9</Text>
          <View className="flex-row flex-wrap gap-4">
            {(["primary", "success", "warning", "destructive"] as const).map((tone) => (
              <Text key={tone} variant="label" tone={tone}>
                {tone}
              </Text>
            ))}
          </View>
          <Text>{LONG_TEXT}</Text>
        </Section>

        <Section title="Buttons and icons">
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
              <Text>Large action</Text>
            </Button>
            <Button size="compact" variant="secondary">
              <Text>Compact</Text>
            </Button>
            <Button size="icon" variant="outline" accessibilityLabel="Open cart">
              <Icon as={ShoppingCart} />
            </Button>
            <Icon as={Check} className="text-success" accessibilityLabel="Complete" />
            <Icon as={PackageOpen} className="text-muted-foreground" />
          </View>
          <Button block>
            <Text>Full-width action</Text>
          </Button>
        </Section>

        <Section title="Form controls">
          <Label>Standalone label</Label>
          <Input
            label="Store email"
            placeholder="name@store.example"
            value={input}
            onChangeText={setInput}
          />
          <Input
            label="Order code"
            hint="Six characters, excluding I, O, 0 and 1."
            placeholder="A7K2M9"
          />
          <Input label="Invalid field" errorMessage="Enter a valid order code." value="123" />
          <Input label="Disabled field" editable={false} value="Read only" />
          <FormField label="Composed field" hint="FormField accepts any compatible control.">
            <InputControl accessibilityLabel="Composed field" />
          </FormField>
        </Section>

        <Section title="Selection controls">
          <RadioGroup value={radio} onValueChange={setRadio} accessibilityLabel="Workspace role">
            <RadioGroupItem value="customer">
              <View className="flex-1 gap-1">
                <Text variant="label">Customer</Text>
                <Text variant="caption" tone="muted">
                  Browse the in-store catalog.
                </Text>
              </View>
            </RadioGroupItem>
            <RadioGroupItem value="preparation">
              <View className="flex-1 gap-1">
                <Text variant="label">Preparation</Text>
                <Text variant="caption" tone="muted">
                  Manage active orders.
                </Text>
              </View>
            </RadioGroupItem>
            <RadioGroupItem value="disabled" disabled>
              <Text variant="label">Unavailable option</Text>
            </RadioGroupItem>
          </RadioGroup>
          <View className="flex-row flex-wrap gap-3">
            <Toggle pressed={toggle} onPressedChange={setToggle}>
              <Text>{toggle ? "Selected" : "Toggle"}</Text>
            </Toggle>
            <Toggle variant="outline" pressed={false} onPressedChange={() => undefined} disabled>
              <Text>Disabled</Text>
            </Toggle>
          </View>
          <ToggleGroup
            type="multiple"
            value={group}
            onValueChange={setGroup}
            accessibilityLabel="Catalog status"
          >
            <ToggleGroupItem value="available">
              <Text>Available</Text>
            </ToggleGroupItem>
            <ToggleGroupItem value="featured">
              <Text>Featured</Text>
            </ToggleGroupItem>
            <ToggleGroupItem value="new">
              <Text>New</Text>
            </ToggleGroupItem>
          </ToggleGroup>
        </Section>

        <Section title="Badges and alerts">
          <View className="flex-row flex-wrap gap-2">
            {(["neutral", "primary", "success", "warning", "destructive", "outline"] as const).map(
              (variant) => (
                <Badge key={variant} variant={variant}>
                  <Text>{variant}</Text>
                </Badge>
              ),
            )}
          </View>
          <Alert title="Information" description="A calm informational message." />
          <Alert variant="success">
            <AlertTitle>Order submitted</AlertTitle>
            <AlertDescription>Reference A7K2M9.</AlertDescription>
          </Alert>
          <Alert
            variant="warning"
            title="Connection is unstable"
            description="Some actions may take longer."
          />
          <Alert
            variant="destructive"
            title="Item unavailable"
            description="Choose another variant."
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

        <Section title="Cards and media">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>Product surface</CardTitle>
              <CardDescription>Brand · Category</CardDescription>
            </CardHeader>
            <CardContent className="gap-3">
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-md">
                <AppImage uri={null} alt="Missing product image" className="h-full w-full" />
              </AspectRatio>
              <Text tone="muted">{LONG_TEXT}</Text>
            </CardContent>
            <CardFooter>
              <Button size="compact">
                <Text>Add to cart</Text>
              </Button>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Progress and loading">
          <Progress value={35} accessibilityLabel="Example progress, 35 percent" />
          <View className="flex-row items-center gap-3">
            <Spinner size="small" />
            <Text tone="muted">Updating inventory</Text>
          </View>
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
              <TabsTrigger value="ready" disabled>
                <Text>Ready</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="new">
              <Text>New orders</Text>
            </TabsContent>
            <TabsContent value="preparing">
              <Text>Orders being prepared</Text>
            </TabsContent>
          </Tabs>
          <View className="h-12 flex-row items-center gap-4">
            <Text tone="muted">Vertical</Text>
            <Separator orientation="vertical" />
            <Text>separator</Text>
          </View>
        </Section>

        <Section title="Dialogs and overlays">
          <View className="flex-row flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Text>Dialog</Text>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Product details</DialogTitle>
                  <DialogDescription>Dialog behavior comes from RN Primitives.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <Text>Alert dialog</Text>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear selection?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This decision requires an explicit response.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <Text>Cancel</Text>
                  </AlertDialogCancel>
                  <AlertDialogAction>
                    <Text>Continue</Text>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AdaptiveSheet>
              <AdaptiveSheetTrigger asChild>
                <Button variant="outline">
                  <Text>Adaptive sheet</Text>
                </Button>
              </AdaptiveSheetTrigger>
              <AdaptiveSheetContent>
                <AdaptiveSheetHeader>
                  <AdaptiveSheetTitle>Adaptive surface</AdaptiveSheetTitle>
                  <AdaptiveSheetDescription>
                    Side-oriented in landscape and bottom-oriented otherwise.
                  </AdaptiveSheetDescription>
                </AdaptiveSheetHeader>
              </AdaptiveSheetContent>
            </AdaptiveSheet>
            <Button variant="destructive" onPress={() => setConfirmOpen(true)}>
              <Text>Confirm dialog</Text>
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setBlocking(true);
                setTimeout(() => setBlocking(false), 1200);
              }}
            >
              <Text>Blocking overlay</Text>
            </Button>
          </View>
        </Section>

        <Section title="Full feedback states">
          <OfflineNotice />
          <View className="h-44 rounded-lg border border-border">
            <LoadingState />
          </View>
          <View className="h-56 rounded-lg border border-border">
            <EmptyState
              icon={PackageOpen}
              title="No products available"
              description="Browse another category."
              action={{ label: "Browse catalog", onPress: () => {} }}
            />
          </View>
          <View className="h-56 rounded-lg border border-border">
            <ErrorState
              error={
                new AppError({ kind: "network", userMessage: "We could not reach the network." })
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
      <BlockingOverlay visible={blocking} label="Submitting your order..." />
    </Screen>
  );
}
