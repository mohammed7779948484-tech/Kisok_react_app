import { useEffect, useState } from "react";
import { View } from "react-native";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@/design-system";

import { readReleaseIdentity, releaseNotesFor, shouldAnnounce } from "../model/release-notes";
import { readLastSeenRelease, writeLastSeenRelease } from "../state/last-seen-release";

/**
 * Tells the customer, once, that the tablet is running a new KISOK build.
 *
 * This is the WHOLE feature. ManageEngine has already checked for, downloaded
 * and silently installed the update before this component ever mounts — KISOK
 * does none of that and must never be asked to. All this does is notice that
 * the running build differs from the one the tablet last acknowledged.
 *
 * It renders nothing until it has read local storage, so it cannot flash on
 * startup, and it never blocks what is behind it: on any storage failure it
 * stays silent and the customer experience is untouched.
 */
export function WhatsNewGate() {
  const [release] = useState(readReleaseIdentity);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const lastSeen = await readLastSeenRelease();
      // `undefined` is an unreadable store, not a first install. Saying nothing
      // is the only honest option: announcing would claim an update that may
      // not have happened.
      if (cancelled || lastSeen === undefined || release === undefined) return;

      if (shouldAnnounce(release, lastSeen)) {
        setOpen(true);
        return;
      }
      // First install, or an already-acknowledged release. Record it silently
      // so the NEXT update has something to compare against.
      if (lastSeen === null) await writeLastSeenRelease(release.token);
    })();

    return () => {
      cancelled = true;
    };
  }, [release]);

  if (release === undefined) return null;

  // Capture the narrowed value for callbacks declared below. TypeScript does
  // not preserve the render-time narrowing of a state value inside closures.
  const currentRelease = release;
  const notes = releaseNotesFor(currentRelease.token);

  function closeForSession() {
    // Back / accessibility escape / overlay dismissal hides the message for
    // this session only. It is NOT an acknowledgement, so the stored release
    // stays unchanged and the notice can appear again after a restart.
    setOpen(false);
  }

  async function acknowledge() {
    // Continue is the only acknowledgement path. Close first: persistence may
    // fail on a tablet with a full or locked store, and the customer must never
    // be trapped behind this dialog because local storage is unavailable.
    setOpen(false);
    await writeLastSeenRelease(currentRelease.token);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeForSession())}>
      <DialogContent accessibilityLabel="KISOK has been updated">
        <DialogHeader>
          <DialogTitle>KISOK has been updated</DialogTitle>
          <DialogDescription>Version {currentRelease.versionName}</DialogDescription>
        </DialogHeader>

        {notes.length > 0 ? (
          <View className="gap-2" accessibilityRole="list">
            <Text className="font-sans-medium">What&apos;s New</Text>
            {notes.map((note) => (
              <Text key={note}>• {note}</Text>
            ))}
          </View>
        ) : (
          // A release whose notes were forgotten still tells the truth, rather
          // than rendering an empty panel.
          <Text>KISOK has been updated to version {currentRelease.versionName}.</Text>
        )}

        <DialogFooter>
          <Button onPress={() => void acknowledge()}>
            <Text>Continue</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
