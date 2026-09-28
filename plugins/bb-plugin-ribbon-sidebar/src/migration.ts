import {
  acknowledgePlacementMigrationOutputSchema,
  threadStagesMigrationSnapshotSchema,
  type ThreadStagesMigrationSnapshotV1,
} from "./contracts";
import type { PlacementStore } from "./placement-store";

export interface ThreadStagesMigrationClient {
  getPlacementMigrationSnapshotV1(): unknown | Promise<unknown>;
  acknowledgePlacementMigrationV1(input: {
    installationId: string;
    revision: number;
  }): unknown | Promise<unknown>;
}

export async function migrateThreadStages(
  store: PlacementStore,
  client: ThreadStagesMigrationClient,
  maximumAttempts = 5,
): Promise<{
  installationId: string;
  revision: number;
  imported: boolean;
}> {
  let imported = false;
  let latest: ThreadStagesMigrationSnapshotV1 | null = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    latest = threadStagesMigrationSnapshotSchema.parse(
      await client.getPlacementMigrationSnapshotV1(),
    );
    imported =
      store.importThreadStagesSnapshot(withCurrentStages(latest)).imported ||
      imported;
    const acknowledgement = acknowledgePlacementMigrationOutputSchema.parse(
      await client.acknowledgePlacementMigrationV1({
        installationId: latest.installationId,
        revision: latest.revision,
      }),
    );
    if (acknowledgement.transferred) {
      return {
        installationId: latest.installationId,
        revision: latest.revision,
        imported,
      };
    }
  }
  throw new Error(
    `Thread stages placement changed during ${maximumAttempts} migration attempts.`,
  );
}

/**
 * Older Thread stages data names today's stages differently: Idle and the
 * retired Active stage both arrive as Active, keeping the Idle order a thread
 * already had, and Blocked arrives as Blocked on third party.
 */
function withCurrentStages(
  snapshot: ThreadStagesMigrationSnapshotV1,
): ThreadStagesMigrationSnapshotV1 {
  const current = (groupId: string) =>
    groupId === "Idle"
      ? "Active"
      : groupId === "Blocked"
        ? "BlockedOnThirdParty"
        : groupId;
  return {
    ...snapshot,
    placements: snapshot.placements.map((placement) => {
      if (placement.groupingId !== "stages") return placement;
      const hasIdleOrder = placement.orders.some(
        ({ groupId }) => groupId === "Idle",
      );
      return {
        ...placement,
        groupId: current(placement.groupId),
        ...(placement.previousGroupId === undefined
          ? {}
          : { previousGroupId: current(placement.previousGroupId) }),
        orders: placement.orders
          .filter(({ groupId }) => !(groupId === "Active" && hasIdleOrder))
          .map((order) => ({ ...order, groupId: current(order.groupId) })),
      };
    }),
  };
}
