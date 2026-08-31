import { useState } from "react";
import { View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";

import { Button, Icon, Input, Text } from "@/components/ui";
import { InlineError } from "@/components/feedback";
import { useAuth } from "@/core/auth";
import { toAppError } from "@/core/errors";

import { credentialsSchema } from "../schemas/credentials";

/**
 * Email + password for a store-provisioned account.
 *
 * Feature-private: reachable only through this feature's screens. If another
 * feature needs it, export it from `features/auth/index.ts` first.
 */
export function SignInForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    // Ignore repeat taps while a request is in flight.
    if (submitting) return;

    setSubmitError(null);
    const parsed = credentialsSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password") next[field] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      // AuthProvider drives navigation via the route guards; nothing to do here.
    } catch (error) {
      setSubmitError(toAppError(error, "We couldn't sign you in."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="w-full max-w-md gap-4">
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        editable={!submitting}
        errorMessage={fieldErrors.email}
        testID="sign-in-email"
      />

      <View className="gap-2">
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!revealPassword}
          autoCapitalize="none"
          autoComplete="current-password"
          editable={!submitting}
          errorMessage={fieldErrors.password}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
          testID="sign-in-password"
        />
        <Button
          variant="ghost"
          size="compact"
          onPress={() => setRevealPassword((value) => !value)}
          accessibilityLabel={revealPassword ? "Hide password" : "Show password"}
        >
          <Icon as={revealPassword ? EyeOff : Eye} size={18} className="text-muted-foreground" />
          <Text>{revealPassword ? "Hide password" : "Show password"}</Text>
        </Button>
      </View>

      {submitError ? <InlineError error={submitError} /> : null}

      <Button
        size="large"
        block
        disabled={submitting}
        onPress={handleSubmit}
        testID="sign-in-submit"
      >
        <Text>{submitting ? "Signing in…" : "Sign in"}</Text>
      </Button>
    </View>
  );
}
