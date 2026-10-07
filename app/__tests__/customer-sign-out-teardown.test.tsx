import { createContext, useContext, useState } from "react";
import { Pressable, Text } from "react-native";
import { Stack } from "expo-router";
import { renderRouter, screen, userEvent } from "expo-router/testing-library";

/**
 * Customer sign-out against the REAL Expo Router navigator.
 *
 * Customer components read the active profile through a hook that throws when
 * there is none (`useActiveProfile`). When auth flips to signed-out, the
 * `(customer)` group's guard turns false; this pins that the group is torn
 * down without any of its components rendering against a missing profile —
 * the app lands on sign-in instead of the error boundary.
 */
type Profile = { id: string } | null;
const ProfileContext = createContext<{ profile: Profile; signOut: () => void } | null>(null);

function useTestAuth() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("outside provider");
  return value;
}

/** Same contract as `useActiveProfile`: no profile is a programming error. */
function useActiveProfileLike() {
  const { profile } = useTestAuth();
  if (!profile) throw new Error("useActiveProfile called outside an authenticated experience.");
  return profile;
}

function RootLayout() {
  const [profile, setProfile] = useState<Profile>({ id: "customer" });
  return (
    <ProfileContext.Provider value={{ profile, signOut: () => setProfile(null) }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={profile === null}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={profile !== null}>
          <Stack.Screen name="(customer)" />
        </Stack.Protected>
      </Stack>
    </ProfileContext.Provider>
  );
}

function CustomerLayout() {
  // Like CheckoutGate: the group's own layout reads the profile.
  const profile = useActiveProfileLike();
  return (
    <>
      <Text>{`owner:${profile.id}`}</Text>
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

function CustomerHome() {
  // Like useCart: a screen inside the group reads the profile too.
  useActiveProfileLike();
  const { signOut } = useTestAuth();
  return (
    <Pressable accessibilityRole="button" onPress={signOut}>
      <Text>Sign out</Text>
    </Pressable>
  );
}

it("tears the customer group down on sign-out and lands on sign-in without rendering it profile-less", async () => {
  await renderRouter(
    {
      _layout: RootLayout,
      "(customer)/_layout": CustomerLayout,
      "(customer)/index": CustomerHome,
      "sign-in": () => <Text>Sign in screen</Text>,
    },
    { initialUrl: "/" },
  );

  expect(screen.getByText("owner:customer")).toBeTruthy();
  const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);

  await userEvent.press(screen.getByRole("button", { name: "Sign out" }));

  expect(await screen.findByText("Sign in screen")).toBeTruthy();
  expect(screen.queryByText("owner:customer")).toBeNull();
  // A profile-less render would throw and React would report it.
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
