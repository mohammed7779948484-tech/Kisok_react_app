import { Gelasio_500Medium } from "@expo-google-fonts/gelasio/500Medium";
import { Gelasio_600SemiBold } from "@expo-google-fonts/gelasio/600SemiBold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { useColorScheme } from "nativewind";
import { View } from "react-native";

import { fontFamily } from "../tokens/typography";
import { NAV_THEME } from "./navigation-theme";

/**
 * Registered under exactly the family names `tokens/typography` hands to
 * Tailwind, so a `font-sans-semibold` class and this map cannot drift apart.
 */
const FONT_ASSETS = {
  [fontFamily.sans]: Inter_400Regular,
  [fontFamily["sans-medium"]]: Inter_500Medium,
  [fontFamily["sans-semibold"]]: Inter_600SemiBold,
  [fontFamily["sans-bold"]]: Inter_700Bold,
  [fontFamily["sans-extrabold"]]: Inter_800ExtraBold,
  [fontFamily.display]: Gelasio_500Medium,
  [fontFamily["display-semibold"]]: Gelasio_600SemiBold,
};

/**
 * Root of the visual system: bundled fonts and the navigation colour theme.
 *
 * The fonts ship inside the app bundle, so loading is a local read that
 * resolves in a frame or two. Until then a plain canvas-coloured view holds
 * the screen instead of flashing text in a fallback face. A font that fails
 * to load does NOT block the kiosk — text falls back to the platform face,
 * which is legible, just off-brand.
 */
export function DesignSystemProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme } = useColorScheme();
  const [loaded, error] = useFonts(FONT_ASSETS);
  const scheme = colorScheme === "dark" ? "dark" : "light";

  return (
    <NavigationThemeProvider value={NAV_THEME[scheme]}>
      {loaded || error ? children : <View className="flex-1 bg-background" />}
    </NavigationThemeProvider>
  );
}
