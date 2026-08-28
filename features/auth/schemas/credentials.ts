import { z } from "zod";

/**
 * Sign-in credentials for a manually provisioned store account.
 *
 * KISOK has no public signup, no social auth, and no account creation from the
 * tablet. Do not add fields for those — see docs/product-boundaries.md.
 */
export const credentialsSchema = z.object({
  email: z.email({ error: "Enter the store account email." }),
  password: z.string().min(1, { error: "Enter the password." }),
});

export type Credentials = z.infer<typeof credentialsSchema>;
