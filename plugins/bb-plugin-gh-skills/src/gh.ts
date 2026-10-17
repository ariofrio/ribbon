import { execFile } from "node:child_process";
import { stripVTControlCharacters } from "node:util";

export function runGh(args: string[], cwd: string, signal: AbortSignal, command: "skill" | "api" = "skill"): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat", NO_COLOR: "1", CLICOLOR: "0" };
    delete env.GH_FORCE_TTY;
    execFile("gh", [command, ...args], {
      cwd, env, signal, timeout: 5 * 60_000, maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const output = stripVTControlCharacters([stdout, stderr].filter(Boolean).join("\n")).trim();
      if (error) {
        const missing = "code" in error && error.code === "ENOENT";
        reject(new Error(missing
          ? "GitHub CLI was not found on the BB server. Install a version with gh skill support and authenticate gh there."
          : output || error.message));
      } else resolve(command === "api" ? stdout : args.includes("--json") ? stdout.trim() : output);
    });
  });
}
