import { useState } from "react";
import { View } from "react-native";
import { PackageOpen } from "lucide-react-native";

import { AppError } from "@/core/errors";

import { Alert } from "../feedback/alert";
import { BlockingOverlay } from "../feedback/blocking-overlay";
import { ConfirmDialog } from "../feedback/confirm-dialog";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { InlineError } from "../feedback/inline-error";
import { LoadingState } from "../feedback/loading-state";
import { OfflineNotice } from "../feedback/offline-notice";
import { SkeletonGrid } from "../feedback/skeleton-grid";
import { SkeletonList } from "../feedback/skeleton-list";
import { StatusMessage } from "../feedback/status-message";
import { Button } from "../primitives/button";
import { Progress } from "../primitives/progress";
import { Text } from "../primitives/text";
import { LabCaption, LabSection } from "./lab-section";

export function StateExamples() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);

  return (
    <>
      <LabSection eyebrow="Feedback" title="Messages and progress">
        <Alert title="Information" description="A calm informational message." />
        <Alert variant="success" title="Order submitted" description="Reference A7K2M9." />
        <Alert
          variant="warning"
          title="Connection is unstable"
          description="Some actions may take longer."
        />
        <InlineError
          error={
            new AppError({
              kind: "unavailable",
              userMessage: "Some items are no longer available.",
            })
          }
        />
        <View className="gap-3 rounded-2xl bg-primary p-5">
          <StatusMessage inverse message="Added 2 to your cart." />
          <StatusMessage
            inverse
            tone="warning"
            message="This option is already at the cart's limit."
          />
        </View>
        <StatusMessage message="Saved for this session." />
        <Progress value={35} accessibilityLabel="Example progress, 35 percent" />
        <OfflineNotice />
      </LabSection>

      <LabSection eyebrow="Feedback" title="Page states">
        <LabCaption>Loading — skeletons keep the page&apos;s shape</LabCaption>
        <SkeletonList count={2} />
        <SkeletonGrid count={3} columns={3} itemClassName="h-40" />
        <View className="h-40 rounded-lg border border-border">
          <LoadingState />
        </View>
        <EmptyState
          framed
          icon={PackageOpen}
          title="The catalog is empty"
          description="Nothing is available to browse right now."
          action={{ label: "Try again", onPress: () => undefined }}
        />
        <EmptyState
          framed
          eyebrow="Unavailable"
          title="This product is no longer available"
          description="It may have been removed since you opened the catalog."
          action={{ label: "Back to products", onPress: () => undefined }}
          secondaryAction={{ label: "Back to Explore", onPress: () => undefined }}
        />
        <ErrorState
          error={new AppError({ kind: "network", userMessage: "We could not reach the network." })}
          onRetry={() => undefined}
        />
        <View className="flex-row flex-wrap gap-3">
          <Button variant="destructive" onPress={() => setConfirmOpen(true)}>
            <Text>Confirm dialog</Text>
          </Button>
          <Button
            variant="tonal"
            onPress={() => {
              setBlocking(true);
              setTimeout(() => setBlocking(false), 1200);
            }}
          >
            <Text>Blocking overlay</Text>
          </Button>
        </View>
      </LabSection>

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
    </>
  );
}
