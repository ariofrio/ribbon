#!/usr/bin/env bash
set -euo pipefail

qa_server_url="${1:-${BB_SERVER_URL:-}}"
if [[ -z "$qa_server_url" ]]; then
  echo "Pass the bb server URL or set BB_SERVER_URL." >&2
  exit 1
fi

qa_session="thread-stages-indicator-alignment-qa-$$"
cleanup() {
  agent-browser --session "$qa_session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

agent-browser --session "$qa_session" open "$qa_server_url" >/dev/null
agent-browser --session "$qa_session" wait --load networkidle >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  localStorage.removeItem("bb.plugin.thread-stages.threadFilter");
  localStorage.removeItem("bb.plugin.thread-stages.projectFilter");
  localStorage.removeItem("bb.plugin.thread-workflow.projectFilter");
})()' >/dev/null
agent-browser --session "$qa_session" open "$qa_server_url" >/dev/null
agent-browser --session "$qa_session" wait --load networkidle >/dev/null

if agent-browser --session "$qa_session" get count \
  'button[aria-label="Expand Active section"]' | grep -qx '1'; then
  agent-browser --session "$qa_session" click \
    'button[aria-label="Expand Active section"]' >/dev/null
fi

agent-browser --session "$qa_session" eval '(() => {
  const button = document.querySelector(
    "button[aria-label=\"Collapse Active section\"]",
  );
  const section = button?.closest("section");
  const label = button?.closest("[data-sidebar-sticky-tier=\"label\"]");
  const count = [...(label?.querySelectorAll("[aria-label]") ?? [])].find(
    (node) => /^\d+ threads?$/.test(node.getAttribute("aria-label") ?? ""),
  );
  const indicator = section?.querySelector(
    "[data-sidebar-thread-trailing-indicator]",
  );
  if (count) {
    throw new Error("Expanded Active stage unexpectedly shows a count.");
  }
  if (!(indicator instanceof HTMLElement)) {
    throw new Error("Active has no visible thread indicator to compare.");
  }
  const rect = indicator.getBoundingClientRect();
  window.__threadStagesThreadIndicatorCenter = rect.left + rect.width / 2;
})()' >/dev/null

agent-browser --session "$qa_session" click \
  'button[aria-label="Collapse Active section"]' >/dev/null

agent-browser --session "$qa_session" eval '(() => {
  const button = document.querySelector(
    "button[aria-label=\"Expand Active section\"]",
  );
  const label = button?.closest("[data-sidebar-sticky-tier=\"label\"]");
  const indicator = label?.querySelector(
    "[data-sidebar-stage-trailing-indicator]",
  );
  const count = [...(label?.querySelectorAll("[aria-label]") ?? [])].find(
    (node) => /^\d+ threads?$/.test(node.getAttribute("aria-label") ?? ""),
  );
  if (!(indicator instanceof HTMLElement)) {
    throw new Error("Collapsed Active stage has no activity indicator.");
  }
  if (!(count instanceof HTMLElement)) {
    throw new Error("Collapsed nonempty Active stage has no count.");
  }
  const countRect = count.getBoundingClientRect();
  const countCenter = countRect.left + countRect.width / 2;
  const indicatorRect = indicator.getBoundingClientRect();
  const indicatorCenter = indicatorRect.left + indicatorRect.width / 2;
  const threadCenter = window.__threadStagesThreadIndicatorCenter;
  if (
    typeof threadCenter !== "number" ||
    Math.abs(indicatorCenter - threadCenter) > 0.25
  ) {
    throw new Error(
      `Stage indicator center ${indicatorCenter}px does not match thread indicator center ${threadCenter}px.`,
    );
  }
  if (Math.abs(indicatorCenter - countCenter - 28) > 0.25) {
    throw new Error(
      `Stage count center ${countCenter}px is not one indicator slot left of ${indicatorCenter}px.`,
    );
  }
  return JSON.stringify({
    countCenter,
    countWidth: countRect.width,
    indicatorCenter,
    threadCenter,
  });
})()'
