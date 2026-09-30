import { Portal, PortalHost } from "@rn-primitives/portal";
import { Fragment } from "react";

/**
 * A named place in a screen's chrome that something mounted elsewhere can
 * fill. A screen shell renders the host where the action belongs; a provider
 * higher up renders `HeaderAction` to supply it. Neither needs to import the
 * other, so a feature can place a control in another feature's chrome without
 * widening either public API.
 *
 * Content renders at the host, inside the host's React tree, so it must not
 * rely on context that exists only around the `HeaderAction` call site.
 */
const HOST_NAME = "kisok-header-action";

export function HeaderActionHost() {
  return <PortalHost name={HOST_NAME} />;
}

export function HeaderAction({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <Portal name={name} hostName={HOST_NAME}>
      {/* The host renders its portals as an array; the key keeps React quiet. */}
      <Fragment key={name}>{children}</Fragment>
    </Portal>
  );
}
