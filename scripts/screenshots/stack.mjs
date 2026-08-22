// Boots a throwaway bb — its own data directory, server, and host daemon — so
// screenshots never touch the bb the developer is using and always start from
// the same empty state.
//
// Both halves come from the `bb-app` package: the server serves the web client
// only when NODE_ENV is production, and the daemon enrolls through the
// loopback-only /internal/hosts/enroll-key route the desktop app uses on first
// run.
//
// From npm rather than from /Applications, because the bb these shots are
// taken against is an input to every one of them, and an app bundle is
// whichever bb this machine happens to have installed and updated. It is also
// the only reason capturing ever needed macOS — nothing here renders in the
// desktop app.
//
// Pinned in this directory's own package.json rather than the repository's,
// for two reasons. The root lockfile carries every plugin's dependency tree
// nested, which no plain `npm install` reproduces, so adding one dependency
// there rewrites thirteen thousand lines that have nothing to do with it. And
// a manifest here is a file the shot digest already hashes, so bumping bb
// reports every screenshot stale — which is what a new bb does to them.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL("./node_modules/bb-app", import.meta.url));

/**
 * The `bb` that seeds the fixture and stamps the lock. The package's own,
 * because a `bb` found on PATH is the machine's, and seeding a fixture with
 * one version against a server running another is the kind of difference that
 * shows up as a screenshot rather than as an error.
 */
export const BB_CLI_PATH = join(APP_DIR, "host-daemon/dist/bb");

function resolveAppPaths() {
  if (!existsSync(APP_DIR)) {
    throw new Error(
      `bb-app is not installed at ${APP_DIR}. Screenshots render from the package, not the desktop app — run npm ci --prefix scripts/screenshots.`,
    );
  }
  return {
    appDir: APP_DIR,
    // The Node in .nvmrc, which require-node.mjs has already insisted on.
    node: process.execPath,
    serverEntry: join(APP_DIR, "server/dist/index.js"),
    daemonEntry: join(APP_DIR, "host-daemon/dist/daemon-bundle.mjs"),
    cliDir: join(APP_DIR, "host-daemon/dist"),
  };
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Two minutes rather than one, because this is a readiness check bounded by a
 * deadline and a deadline measures the machine. On a box carrying other
 * worktrees' captures, both halves of the stack have failed to come up inside
 * sixty seconds while nothing was wrong with either of them.
 */
async function waitFor(check, { timeoutMs = 120000, label }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * An interrupted run leaves its server and daemon behind, and the daemon holds
 * a lock the next run needs, so a run always ends the previous one first.
 */
function stopPreviousRun(pidPath) {
  if (!existsSync(pidPath)) return;
  for (const pid of JSON.parse(readFileSync(pidPath, "utf8"))) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone, which is the state we wanted.
    }
  }
}

export async function startStack({ dataDir, logStream }) {
  const paths = resolveAppPaths();
  const pidPath = join(dirname(dataDir), "stack-pids.json");
  stopPreviousRun(pidPath);
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  const serverPort = await freePort();
  const hostDaemonPort = await freePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const children = [];

  function launch(entry, env) {
    const child = spawn(paths.node, [entry], {
      env: {
        ...process.env,
        // The server only mounts the web client's static bundle in production.
        NODE_ENV: "production",
        BB_DATA_DIR: dataDir,
        BB_TELEMETRY: "false",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    children.push(child);
    writeFileSync(pidPath, JSON.stringify(children.map((each) => each.pid)));
    return child;
  }

  launch(paths.serverEntry, {
    BB_SERVER_PORT: String(serverPort),
    BB_SERVER_BIND_HOST: "127.0.0.1",
  });
  await waitFor(
    async () => {
      try {
        return (await fetch(serverUrl)).ok;
      } catch {
        return false;
      }
    },
    { label: "the bb server to listen" },
  );

  // The daemon needs bootstrap material; the server mints it for loopback
  // callers, the same path the desktop app takes when it first runs.
  const enrollment = await fetch(
    new URL("/internal/hosts/enroll-key", serverUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  ).then((response) => response.json());

  launch(paths.daemonEntry, {
    BB_SERVER_URL: serverUrl,
    BB_HOST_DAEMON_PORT: String(hostDaemonPort),
    BB_HOST_NAME: "screenshots",
    BB_HOST_TYPE: "persistent",
    BB_HOST_ID: enrollment.hostId,
    BB_HOST_ENROLL_KEY: enrollment.enrollKey,
    BB_CLI_DIR: paths.cliDir,
  });

  const env = {
    ...process.env,
    BB_DATA_DIR: dataDir,
    BB_SERVER_URL: serverUrl,
    BB_PROJECT_ID: undefined,
    BB_THREAD_ID: undefined,
    BB_ENVIRONMENT_ID: undefined,
  };

  await waitFor(
    async () => {
      const response = await fetch(new URL("/api/v1/hosts", serverUrl)).catch(
        () => null,
      );
      if (!response?.ok) return false;
      const body = await response.json();
      const hosts = Array.isArray(body) ? body : (body.hosts ?? []);
      return hosts.some((host) => host.status === "connected");
    },
    { label: "the host daemon to connect" },
  );

  return {
    serverUrl,
    dataDir,
    env,
    async stop() {
      for (const child of children) child.kill("SIGTERM");
      await Promise.all(
        children.map(
          (child) =>
            new Promise((resolve) => {
              if (child.exitCode !== null) resolve();
              child.on("exit", resolve);
              setTimeout(() => {
                child.kill("SIGKILL");
                resolve();
              }, 5000);
            }),
        ),
      );
    },
  };
}
