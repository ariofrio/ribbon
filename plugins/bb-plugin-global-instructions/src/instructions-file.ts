import { createHash, randomUUID } from "node:crypto";
import { chmod, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import type { InstructionsSnapshot } from "./contract";

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function revision(instructions: string): string {
  return createHash("sha256").update(instructions).digest("hex");
}

export class InstructionsFile {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {}

  async read(): Promise<InstructionsSnapshot> {
    try {
      const instructions = await readFile(this.path, "utf8");
      return { instructions, revision: revision(instructions), path: this.path };
    } catch (error) {
      if (!missing(error)) throw error;
      return { instructions: "", revision: "missing", path: this.path };
    }
  }

  save(instructions: string, expectedRevision: string) {
    const operation = this.pending.then(async () => {
      const current = await this.read();
      if (current.revision !== expectedRevision) {
        return { status: "conflict" as const, snapshot: current };
      }
      // Follow an existing symlink so the server keeps reading its original target.
      const target = await realpath(this.path).catch((error: unknown) => {
        if (missing(error)) return this.path;
        throw error;
      });
      const mode = await stat(target).then((info) => info.mode & 0o777).catch((error: unknown) => {
        if (missing(error)) return 0o600;
        throw error;
      });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, instructions, { encoding: "utf8", flag: "wx", mode });
        await chmod(temporary, mode);
        // Check again after staging, catching edits made while writing a large draft.
        const latest = await this.read();
        if (latest.revision !== expectedRevision) {
          return { status: "conflict" as const, snapshot: latest };
        }
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
      return { status: "saved" as const, snapshot: { instructions, revision: revision(instructions), path: this.path } };
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
