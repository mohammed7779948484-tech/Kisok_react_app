const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // NativeWind resolves `rem` units to 14px on native by DEFAULT, while a
  // browser resolves them to 16px. Tailwind's scale is rem-based, so the default
  // makes every size ~12% smaller on the Android tablet than in the web preview
  // agents verify against — and smaller than Tailwind documents.
  //
  // KISOK is read at arm's length on a tablet, so the larger value is also the
  // right one for the product. 16 keeps native, web and the Tailwind scale in
  // agreement.
  inlineRem: 16,
});
