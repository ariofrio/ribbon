// @vitest-environment jsdom
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, expect, it } from "vitest";
import { defaultPreferences } from "../../shared/preferences.js";
import { usePreferencesSync } from "./PreferencesSync.js";
import { preferenceValueAtom, resetPreferencesSyncForTest } from "./preferences-sync.js";

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  localStorage.clear();
});

function Preference() {
  usePreferencesSync();
  const mode = useAtomValue(preferenceValueAtom("organizationMode"));
  return <output>{mode}</output>;
}

it("refreshes preferences missed while disconnected once for all sync owners", async () => {
  let mode = "project";
  const slot = renderSlot({ component: () => <><Preference /><Preference /></> }, {}, {
    rpc: { listPreferences: () => ({ preferences: { ...defaultPreferences(), organizationMode: mode } }) },
  });
  await waitFor(() => expect(screen.getAllByRole("status").map((node) => node.textContent)).toEqual(["project", "project"]));
  for (const next of ["machine", "chronological"]) {
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    mode = next;
    const callsBefore = slot.inspection.rpcCalls.length;
    await slot.behavior.setRealtimeConnectionState("connected");
    await waitFor(() => expect(screen.getAllByRole("status").map((node) => node.textContent)).toEqual([next, next]));
    expect(slot.inspection.rpcCalls.length - callsBefore).toBe(1);
  }
});
