import { useState } from "react";
import { Pressable, View } from "react-native";
import { ArrowRight, ShoppingCart } from "lucide-react-native";

import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  AdaptiveSheetTrigger,
} from "../composites/adaptive-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../composites/dialog";
import { FormField, Input } from "../composites/form-field";
import { QuantityStepper } from "../composites/quantity-stepper";
import { SearchInput } from "../composites/search-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../composites/tabs";
import { GridCell, ResponsiveGrid } from "../layout/responsive-grid";
import { SplitPane } from "../layout/split-pane";
import { MEDIA_TINTS, MediaFrame } from "../media/media-frame";
import { ArrowDisc } from "../patterns/arrow-disc";
import { Breadcrumb } from "../patterns/breadcrumb";
import { KeyFigure, PageHeading } from "../patterns/page-heading";
import { ResultToolbar } from "../patterns/result-toolbar";
import { SectionHeading, SectionLink } from "../patterns/section-heading";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { Icon } from "../primitives/icon";
import { InputControl } from "../primitives/input";
import { RadioGroup, RadioGroupItem } from "../primitives/radio-group";
import { Text } from "../primitives/text";
import { Toggle } from "../primitives/toggle";
import { ToggleGroup, ToggleGroupItem } from "../primitives/toggle-group";
import { LabCaption, LabSection } from "./lab-section";

export function ComponentExamples({ wide }: { wide: boolean }) {
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState(2);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("customer");
  const [toggle, setToggle] = useState(false);
  const [group, setGroup] = useState<string[]>(["available"]);
  const [tab, setTab] = useState("new");

  return (
    <>
      <LabSection eyebrow="Primitives" title="Actions">
        <View className="flex-row flex-wrap items-center gap-3">
          <Button>
            <Text>Primary</Text>
          </Button>
          <Button variant="tonal">
            <Text>Tonal</Text>
          </Button>
          <Button variant="outline">
            <Text>Outline</Text>
          </Button>
          <Button variant="ghost">
            <Text>Ghost</Text>
          </Button>
          <Button variant="text">
            <Text>Text action</Text>
            <Icon as={ArrowRight} size={16} />
          </Button>
          <Button variant="destructive">
            <Text>Destructive</Text>
          </Button>
          <Button disabled>
            <Text>Disabled</Text>
          </Button>
        </View>
        <View className="flex-row flex-wrap items-center gap-4 rounded-2xl bg-primary p-6">
          <Button variant="inverse">
            <Text>Explore product</Text>
            <Icon as={ArrowRight} size={18} />
          </Button>
          <ArrowDisc tone="inverse" size={44} />
          <QuantityStepper
            value={quantity}
            min={1}
            onValueChange={setQuantity}
            tone="inverse"
            className="w-[136px]"
          />
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <Button size="large">
            <Icon as={ShoppingCart} size={20} className="text-primary-foreground" />
            <Text>Large action</Text>
          </Button>
          <Button size="compact" variant="tonal">
            <Text>Compact</Text>
          </Button>
          <Button size="icon" variant="outline" accessibilityLabel="Open cart">
            <Icon as={ShoppingCart} size={18} />
          </Button>
          <ArrowDisc />
          <ArrowDisc tone="tonal" size={34} />
          <QuantityStepper
            value={quantity}
            min={1}
            onValueChange={setQuantity}
            className="w-[136px]"
          />
        </View>
      </LabSection>

      <LabSection eyebrow="Primitives & composites" title="Fields and selection">
        <View className={wide ? "flex-row gap-8" : "gap-6"}>
          <View className="flex-1 gap-4">
            <Input label="Store email" placeholder="name@store.example" />
            <Input label="Order code" hint="Six characters." placeholder="A7K2M9" />
            <Input label="Invalid field" errorMessage="Enter a valid order code." value="123" />
            <FormField label="Composed field" hint="FormField wires any control to its label.">
              <InputControl accessibilityLabel="Composed field" />
            </FormField>
          </View>
          <View className="flex-1 gap-4">
            <LabCaption>Search — field, rule, inverse</LabCaption>
            <SearchInput value={search} onChangeText={setSearch} placeholder="Find a brand…" />
            <SearchInput
              value={search}
              onChangeText={setSearch}
              appearance="rule"
              placeholder="Find a flavor…"
              trailing={46}
            />
            <View className="rounded-2xl bg-primary p-4">
              <SearchInput
                value={search}
                onChangeText={setSearch}
                appearance="inverse"
                size="large"
                placeholder="Search the whole store"
              />
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => setChecked((current) => !current)}
              className="min-h-touch flex-row items-center gap-3.5"
            >
              <Checkbox checked={checked} onCheckedChange={setChecked} aria-hidden />
              <Text>Available options</Text>
            </Pressable>
          </View>
        </View>
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
        </RadioGroup>
        <View className="flex-row flex-wrap items-center gap-3">
          <Toggle pressed={toggle} onPressedChange={setToggle}>
            <Text>{toggle ? "Selected" : "Toggle"}</Text>
          </Toggle>
          <ToggleGroup
            layout="segmented"
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
          </ToggleGroup>
          {(["neutral", "primary", "success", "warning", "destructive", "outline"] as const).map(
            (variant) => (
              <Badge key={variant} variant={variant}>
                <Text>{variant}</Text>
              </Badge>
            ),
          )}
        </View>
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
            <Text tone="muted">New orders</Text>
          </TabsContent>
          <TabsContent value="preparing">
            <Text tone="muted">Orders being prepared</Text>
          </TabsContent>
          <TabsContent value="ready">
            <Text tone="muted">Ready for pickup</Text>
          </TabsContent>
        </Tabs>
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
                <DialogDescription>Interaction comes from RN Primitives.</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
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
                  A side sheet in landscape, a bottom sheet otherwise.
                </AdaptiveSheetDescription>
              </AdaptiveSheetHeader>
            </AdaptiveSheetContent>
          </AdaptiveSheet>
        </View>
      </LabSection>

      <LabSection eyebrow="Patterns" title="Page shapes">
        <View className="rounded-3xl border border-border bg-background p-6">
          <PageHeading
            wide={wide}
            breadcrumb={[{ label: "Explore", onPress: () => undefined }, { label: "Products" }]}
            eyebrow="Complete catalog"
            title="Products"
            description="Browse the store, then narrow by category, brand, or availability."
            aside={<KeyFigure value={19} label="products in the store" />}
          />
        </View>
        <SectionHeading
          eyebrow="Discover the store"
          title="Store Map"
          description="Explore the store by category."
          action={<SectionLink label="View all categories" onPress={() => undefined} />}
        />
        <Breadcrumb
          items={[
            { label: "Categories", onPress: () => undefined },
            { label: "Vape Products", onPress: () => undefined },
            { label: "Disposable Vapes" },
          ]}
        />
        <ResultToolbar countLabel="19 products" scopeLabel="All catalog products">
          <Button size="compact" variant="tonal">
            <Text>Filters</Text>
          </Button>
        </ResultToolbar>
      </LabSection>

      <LabSection eyebrow="Media & layout" title="Frames, grids and splits">
        <ResponsiveGrid minItemWidth={180} gap={14} maxColumns={5}>
          {MEDIA_TINTS.map((tint) => (
            <GridCell key={tint}>
              <MediaFrame
                source={null}
                alt=""
                tint={tint}
                fallbackLabel={`${tint} fallback`}
                className="h-36 rounded-xl"
              />
            </GridCell>
          ))}
        </ResponsiveGrid>
        <SplitPane
          split={wide}
          primaryFlex={1.08}
          secondaryFlex={0.8}
          gap={34}
          primary={
            <View className="h-40 items-center justify-center rounded-xl border border-border bg-muted">
              <Text tone="muted">Stage (1.08)</Text>
            </View>
          }
          secondary={
            <View className="h-40 items-center justify-center rounded-xl bg-primary">
              <Text tone="inverse">Canvas (0.8)</Text>
            </View>
          }
        />
      </LabSection>
    </>
  );
}
