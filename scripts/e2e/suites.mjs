import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function discoverSuites(
  directory = new URL("./suites/", import.meta.url),
) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const files = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".suite.mjs"))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) throw new Error(`No E2E suites found in ${root}`);
  const suites = [];
  const ids = new Set();
  for (const file of files) {
    const { default: suite } = await import(
      pathToFileURL(join(root, file)).href
    );
    const names = (values) =>
      Array.isArray(values) &&
      values.every((value) => typeof value === "string" && value.length > 0) &&
      new Set(values).size === values.length;
    if (
      !suite ||
      typeof suite.id !== "string" ||
      !suite.id ||
      suite.id.includes(":") ||
      !names(suite.cases) ||
      suite.cases.length === 0 ||
      suite.cases.some((name) => name.includes(":")) ||
      !names(suite.plugins) ||
      typeof suite.run !== "function" ||
      (suite.prepare !== undefined && typeof suite.prepare !== "function") ||
      (suite.order !== undefined && !Number.isFinite(suite.order))
    ) {
      throw new Error(`Invalid E2E suite in ${file}`);
    }
    if (ids.has(suite.id))
      throw new Error(`Duplicate E2E suite ${suite.id} in ${file}`);
    ids.add(suite.id);
    suites.push(suite);
  }
  return suites.sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) -
      (b.order ?? Number.MAX_SAFE_INTEGER),
  );
}

export function selectSuites(suites, requestedCases) {
  const available = new Set(
    suites.flatMap((suite) =>
      suite.cases.map((testCase) => `${suite.id}:${testCase}`),
    ),
  );
  for (const requestedCase of requestedCases) {
    if (!available.has(requestedCase)) {
      throw new Error(
        `Unknown E2E case ${requestedCase}. Available cases: ${[...available].join(", ")}`,
      );
    }
  }
  return suites
    .map((suite) => ({
      ...suite,
      selectedCases:
        requestedCases.length === 0
          ? suite.cases
          : suite.cases.filter((testCase) =>
              requestedCases.includes(`${suite.id}:${testCase}`),
            ),
    }))
    .filter((suite) => suite.selectedCases.length > 0);
}
