import { Platform, Pressable } from "react-native";
import Animated from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type AnimatedViewProps = Omit<React.ComponentProps<typeof Animated.View>, "key" | "ref"> & {
  as?: "View";
};
type AnimatedPressableProps = Omit<
  React.ComponentProps<typeof AnimatedPressable>,
  "key" | "ref"
> & {
  as: "Pressable";
};

function NativeOnlyAnimatedView(props: AnimatedViewProps | AnimatedPressableProps) {
  if (Platform.OS === "web") return <>{props.children}</>;
  if (props.as === "Pressable") {
    const { as: _as, ...pressableProps } = props;
    return <AnimatedPressable {...pressableProps} />;
  }
  const { as: _as, ...viewProps } = props;
  return <Animated.View {...viewProps} />;
}

export { NativeOnlyAnimatedView };
