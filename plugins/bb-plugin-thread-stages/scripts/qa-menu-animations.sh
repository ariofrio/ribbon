#!/usr/bin/env bash
set -euo pipefail

qa_server_url="${1:-${BB_SERVER_URL:-}}"
if [[ -z "$qa_server_url" ]]; then
  echo "Pass the bb server URL or set BB_SERVER_URL." >&2
  exit 1
fi

qa_session="thread-stages-menu-animation-qa-$$"
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

agent-browser --session "$qa_session" eval '(() => {
  window.__threadStagesMenuMotion = [];
  window.__captureThreadStagesMenuMotion = (element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.getAttribute("role") !== "menu") return;
    const state = element.getAttribute("data-state");
    if (state !== "open" && state !== "closed") return;
    const style = getComputedStyle(element);
    window.__threadStagesMenuMotion.push({
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      state,
      text: element.textContent?.replace(/\\s+/g, " ").trim() ?? "",
    });
  };
  window.__observeThreadStagesMenuClose = (element) => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute("data-state") !== "closed") return;
      window.__captureThreadStagesMenuMotion?.(element);
      observer.disconnect();
    });
    observer.observe(element, {
      attributeFilter: ["data-state"],
      attributes: true,
    });
  };
})()' >/dev/null

agent-browser --session "$qa_session" click '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" wait '[role="menu"][data-state="open"]' >/dev/null

agent-browser --session "$qa_session" eval '(() => {
  const element = [...document.querySelectorAll("[role=menu][data-state=open]")].find(
    (candidate) => /All sections/.test(candidate.textContent ?? ""),
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error("The project filter menu did not open.");
  }
  window.__captureThreadStagesMenuMotion?.(element);
  window.__observeThreadStagesMenuClose?.(element);
  const root = window.__threadStagesMenuMotion?.at(-1);
  if (root.animationName === "none" || root.animationDuration === "0s") {
    throw new Error(
      `Project filter opens without animation (${root.animationName}, ${root.animationDuration}).`,
    );
  }
})()' >/dev/null

agent-browser --session "$qa_session" hover \
  '[data-thread-filter-submenu-chevron]' >/dev/null
agent-browser --session "$qa_session" wait --text 'Project settings' >/dev/null

agent-browser --session "$qa_session" eval '(() => {
  const element = [...document.querySelectorAll("[role=menu][data-state=open]")].find(
    (candidate) => /Project settings/.test(candidate.textContent ?? ""),
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error("The project action submenu did not open.");
  }
  window.__captureThreadStagesMenuMotion?.(element);
  window.__observeThreadStagesMenuClose?.(element);
  const submenu = window.__threadStagesMenuMotion?.at(-1);
  if (
    submenu.animationName === "none" ||
    submenu.animationDuration === "0s"
  ) {
    throw new Error(
      `Project submenu opens without animation (${submenu.animationName}, ${submenu.animationDuration}).`,
    );
  }
})()' >/dev/null

agent-browser --session "$qa_session" press Escape >/dev/null
agent-browser --session "$qa_session" press Escape >/dev/null
agent-browser --session "$qa_session" wait --fn \
  '((window.__threadStagesMenuMotion?.filter((record) => record.state === "closed").length ?? 0) >= 2)' >/dev/null

agent-browser --session "$qa_session" eval '(() => {
  const records = window.__threadStagesMenuMotion ?? [];
  const closed = records.filter((record) => record.state === "closed");
  if (closed.length < 2) {
    throw new Error(`Expected closing states for both menus; saw ${closed.length}.`);
  }
  const unanimated = closed.find(
    (record) => record.animationName === "none" || record.animationDuration === "0s",
  );
  if (unanimated) {
    throw new Error(
      `Menu closes without animation (${unanimated.animationName}, ${unanimated.animationDuration}).`,
    );
  }
  return JSON.stringify(records);
})()'
