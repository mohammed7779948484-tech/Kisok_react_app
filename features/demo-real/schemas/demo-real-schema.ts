import { z } from "zod";

/**
 * Runtime shape of the data this feature reads.
 *
 * Every KISOK RPC returns `jsonb`, which Supabase generates as the wide `Json`
 * union — so validating here is what turns an untyped payload into something
 * the rest of the feature can trust. A backend change then fails loudly at this
 * boundary instead of as `undefined` deep inside a screen.
 *
 * TODO: replace these placeholder fields with the real ones. Check
 * `supabase/migrations/*.sql` for the authoritative column names — do NOT copy
 * field names from the Flutter reference.
 */
export const demoRealItemSchema = z.object({
  id: z.uuid(),
  label: z.string(),
});

export type DemoRealItem = z.infer<typeof demoRealItemSchema>;

export const demoRealPayloadSchema = z.array(demoRealItemSchema);
