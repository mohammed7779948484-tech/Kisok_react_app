import { DemoRealScreen } from "@/features/demo-real";

/**
 * Route only. Adding a file here is the whole registration step — there is no
 * central route table to edit, which is what keeps parallel feature work from
 * conflicting.
 *
 * Keep this file thin: no data loading, no state, no business logic. If you
 * need route params, read them here with `useLocalSearchParams` and pass them
 * to the screen as props.
 */
export default function DemoRealRoute() {
  return <DemoRealScreen />;
}
