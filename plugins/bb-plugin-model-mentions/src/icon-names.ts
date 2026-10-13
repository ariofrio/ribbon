// App icon names must be registered synchronously during frontend setup.
// Durable slots let provider SVGs share the native renderer without copying them.
export const PROVIDER_ICON_SLOTS = 256;
export const providerIconName = (slot: number) =>
  `model-mentions/provider-${slot}`;
