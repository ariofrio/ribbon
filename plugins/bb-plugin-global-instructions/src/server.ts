import { join } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contract";
import { InstructionsFile } from "./instructions-file";

export default function plugin(bb: BbPluginApi) {
  const file = new InstructionsFile(join(bb.server.experimental_dataDir, "AGENTS.md"));
  bb.rpc.register(rpcContract, {
    "instructions.read": () => file.read(),
    "instructions.save": ({ instructions, revision }) => file.save(instructions, revision),
  });
}
