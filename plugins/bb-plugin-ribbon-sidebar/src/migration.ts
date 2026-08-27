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
    imported = store.importThreadStagesSnapshot(latest).imported || imported;
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
