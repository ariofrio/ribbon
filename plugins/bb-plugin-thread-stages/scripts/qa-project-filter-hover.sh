#!/usr/bin/env bash
set -euo pipefail

qa_server_url="${1:-${BB_SERVER_URL:-}}"
qa_empty_project_name="${2:-homelab}"
if [[ -z "$qa_server_url" ]]; then
  echo "Pass the bb server URL or set BB_SERVER_URL." >&2
  exit 1
fi

qa_session="thread-stages-project-filter-qa-$$"
cleanup() {
  agent-browser --session "$qa_session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

agent-browser --session "$qa_session" open "$qa_server_url" >/dev/null
agent-browser --session "$qa_session" wait '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" set viewport 900 700 2 >/dev/null
agent-browser --session "$qa_session" wait 300 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector("[data-thread-filter-trigger]");
  const icon = control?.querySelector("svg");
  const label = control?.querySelector("span")?.textContent?.trim();
  if (
    !(control instanceof HTMLButtonElement) ||
    !(icon instanceof SVGElement) ||
    label !== "Sections and projects" ||
    icon.getAttribute("data-icon") !== "FolderLibrary"
  ) {
    throw new Error(
      `Unexpected unfiltered control: ${JSON.stringify({ label, icon: icon?.getAttribute("data-icon") })}.`,
    );
  }
  return JSON.stringify({ unfilteredControl: { label, icon: "FolderLibrary" } });
})()'
agent-browser --session "$qa_session" click \
  '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const menu = document.querySelector("[role=menu][data-bb-plugin-root]");
  const groupLabels = menu === null
    ? []
    : [...menu.querySelectorAll("[id^=thread-filter-]")]
        .filter((node) => node.textContent === "Projects" || node.textContent === "Sections");
  const groups = menu === null
    ? []
    : [...menu.querySelectorAll("[role=group][aria-labelledby]")];
  const separators = menu === null
    ? []
    : [...menu.querySelectorAll("[role=separator]")];
  const stageHeader = document.querySelector("[data-sidebar-sticky-tier=label]");
  const createItems = menu === null
    ? []
    : [...menu.querySelectorAll("[role=menuitem]")]
        .filter((item) => item.textContent === "New project" || item.textContent === "New section");
  const allItem = menu?.querySelector("[role=menuitemradio]");
  if (
    !(menu instanceof HTMLElement) ||
    !(stageHeader instanceof HTMLElement) ||
    groupLabels.map((label) => label.textContent).join(",") !== "Sections,Projects" ||
    groups.length !== groupLabels.length ||
    separators.length !== groupLabels.length ||
    createItems.map((item) => item.textContent).join(",") !== "New section,New project" ||
    allItem?.textContent !== "All sections and projects"
  ) {
    throw new Error(`Unexpected native dropdown structure: ${JSON.stringify({
      labels: groupLabels.map((label) => label.textContent),
      groups: groups.length,
      separators: separators.length,
      createItems: createItems.map((item) => item.textContent),
      allItem: allItem?.textContent,
    })}.`);
  }
  const projectGroup = groups.find((group) => group.getAttribute("aria-labelledby") === "thread-filter-projects-label");
  const sectionGroup = groups.find((group) => group.getAttribute("aria-labelledby") === "thread-filter-sections-label");
  const itemText = (group) => group === undefined
    ? []
    : [...group.querySelectorAll(":scope [role=menuitemradio], :scope [role=menuitem]")]
        .map((item) => item.textContent);
  const projectItems = itemText(projectGroup);
  const sectionItems = itemText(sectionGroup);
  const validSectionOrder =
    (sectionItems.length === 1 && sectionItems[0] === "New section") ||
    (sectionItems.at(-2) === "Unorganized" &&
      sectionItems.at(-1) === "New section");
  if (
    projectItems.at(-2) !== "Threads" ||
    projectItems.at(-1) !== "New project" ||
    !validSectionOrder
  ) {
    throw new Error(`Unexpected dropdown item order: ${JSON.stringify({
      projectItems,
      sectionItems,
    })}.`);
  }
  const assertCreationIconAligned = (group, referenceLabel, creationLabel) => {
    const choiceIcon = [...(group?.querySelectorAll("[role=menuitemradio]") ?? [])]
      .find((item) => item.textContent === referenceLabel)
      ?.querySelector("svg");
    const creationIcon = [...(group?.querySelectorAll("[role=menuitem]") ?? [])]
      .find((item) => item.textContent === creationLabel)
      ?.querySelector("svg[data-icon]");
    if (!(choiceIcon instanceof SVGElement) || !(creationIcon instanceof SVGElement)) {
      throw new Error(`Could not measure ${creationLabel} alignment.`);
    }
    const choiceLeft = choiceIcon.getBoundingClientRect().left;
    const creationLeft = creationIcon.getBoundingClientRect().left;
    if (Math.abs(choiceLeft - creationLeft) > 0.5) {
      throw new Error(
        `${creationLabel} starts at ${creationLeft}px; selectable items start at ${choiceLeft}px.`,
      );
    }
    return { choiceLeft, creationLeft };
  };
  const creationAlignment = {
    project: assertCreationIconAligned(projectGroup, "Threads", "New project"),
    section:
      sectionItems.length === 1
        ? null
        : assertCreationIconAligned(sectionGroup, "Unorganized", "New section"),
  };
  const reference = getComputedStyle(stageHeader);
  for (const label of groupLabels) {
    const style = getComputedStyle(label);
    for (const property of ["fontSize", "fontWeight", "lineHeight", "color"]) {
      if (style[property] !== reference[property]) {
        throw new Error(
          `${label.textContent} ${property} is ${style[property]}; native section chrome is ${reference[property]}.`,
        );
      }
    }
  }
  return JSON.stringify({
    nativeDropdown: {
      labels: groupLabels.map((label) => label.textContent),
      groups: groups.length,
      separators: separators.length,
      createItems: createItems.map((item) => item.textContent),
      projectItems,
      sectionItems,
      creationAlignment,
    },
  });
})()'
agent-browser --session "$qa_session" press Escape >/dev/null
agent-browser --session "$qa_session" wait 250 >/dev/null
agent-browser --session "$qa_session" hover \
  '[data-sidebar-sticky-tier="label"]' >/dev/null
agent-browser --session "$qa_session" wait 100 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const actions = document.querySelector("[data-thread-filter-actions]");
  if (!(actions instanceof HTMLElement)) {
    throw new Error("Could not find the thread filter creation actions.");
  }
  const actionLabels = [...actions.querySelectorAll("button[aria-label]")]
    .map((button) => button.getAttribute("aria-label"));
  if (actionLabels.join(",") !== "New section,New project,Sections and projects options") {
    throw new Error(
      `Unexpected thread filter action order: ${JSON.stringify(actionLabels)}.`,
    );
  }
  const style = getComputedStyle(actions);
  const state = {
    opacity: Number.parseFloat(style.opacity),
    pointerEvents: style.pointerEvents,
  };
  if (state.opacity !== 0 || state.pointerEvents !== "none") {
    throw new Error(
      `Thread filter creation actions are visible away from hover: ${JSON.stringify(state)}.`,
    );
  }
  return JSON.stringify({ actionsAwayFromHover: state });
})()'
agent-browser --session "$qa_session" eval '(() => {
  const previous = [...document.querySelectorAll(
    "[data-testid=\"plugin-nav-sidebar-items\"] > * button[aria-label$=\" panel options\"]",
  )].at(-1);
  if (!(previous instanceof HTMLButtonElement)) {
    throw new Error("Could not find the control before the thread filter.");
  }
  previous.focus();
})()'
agent-browser --session "$qa_session" press Tab >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector(
    "[data-thread-filter-trigger]",
  );
  const row = control?.parentElement;
  const actions = document.querySelector("[data-thread-filter-actions]");
  if (
    !(control instanceof HTMLButtonElement) ||
    !(row instanceof HTMLElement) ||
    !(actions instanceof HTMLElement)
  ) {
    throw new Error("Could not find the keyboard-focused thread filter row.");
  }
  if (document.activeElement !== control || !control.matches(":focus-visible")) {
    throw new Error("Native Tab did not visibly focus the thread filter.");
  }
  const actionStyle = getComputedStyle(actions);
  const actionState = {
    opacity: Number.parseFloat(actionStyle.opacity),
    pointerEvents: actionStyle.pointerEvents,
  };
  if (actionState.opacity !== 0 || actionState.pointerEvents !== "none") {
    throw new Error(
      `Thread filter actions are visible while its main control has keyboard focus: ${JSON.stringify(actionState)}.`,
    );
  }
  const controlShadow = getComputedStyle(control).boxShadow;
  const rowShadow = getComputedStyle(row).boxShadow;
  if (controlShadow !== "none" || rowShadow === "none") {
    throw new Error(
      `Keyboard focus ring is on the ${controlShadow === "none" ? "row" : "shortened control"}; expected the full row.`,
    );
  }
  return JSON.stringify({
    keyboardFocus: {
      controlWidth: control.getBoundingClientRect().width,
      rowWidth: row.getBoundingClientRect().width,
      actions: actionState,
      rowShadow,
    },
  });
})()'
agent-browser --session "$qa_session" hover '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" wait 100 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const actions = document.querySelector("[data-thread-filter-actions]");
  if (!(actions instanceof HTMLElement)) {
    throw new Error("Could not find the thread filter creation actions.");
  }
  const style = getComputedStyle(actions);
  const state = {
    opacity: Number.parseFloat(style.opacity),
    pointerEvents: style.pointerEvents,
  };
  if (state.opacity !== 1 || state.pointerEvents !== "auto") {
    throw new Error(
      `Thread filter creation actions did not appear on row hover: ${JSON.stringify(state)}.`,
    );
  }
  return JSON.stringify({ actionsOnHover: state });
})()'
agent-browser --session "$qa_session" hover 'button[aria-label="New project"]' >/dev/null
agent-browser --session "$qa_session" wait 450 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const accessibleTooltip = document.querySelector("[role=\"tooltip\"]");
  const tooltip = document.querySelector(
    "[data-bb-portaled-overlay][data-state]",
  );
  if (
    !(accessibleTooltip instanceof HTMLElement) ||
    !(tooltip instanceof HTMLElement)
  ) {
    throw new Error("New project did not render its tooltip after real hover.");
  }
  const style = getComputedStyle(tooltip);
  const state = {
    backgroundColor: style.backgroundColor,
    color: style.color,
    pluginRoot: tooltip.hasAttribute("data-bb-plugin-root"),
    portaledOverlay: tooltip.hasAttribute("data-bb-portaled-overlay"),
    text: accessibleTooltip.textContent?.trim(),
  };
  if (
    state.text !== "New project" ||
    !state.pluginRoot ||
    !state.portaledOverlay ||
    state.backgroundColor === "rgba(0, 0, 0, 0)"
  ) {
    throw new Error(`Unexpected vendored tooltip rendering: ${JSON.stringify(state)}.`);
  }
  return JSON.stringify({ vendoredTooltip: state });
})()'
agent-browser --session "$qa_session" hover '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" wait 100 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector("[data-thread-filter-trigger]");
  const navigation = document.querySelector(
    "[data-testid=\"plugin-nav-sidebar-items\"]",
  );
  const navigationItems = navigation === null
    ? []
    : [...navigation.children].filter(
        (node) =>
          node instanceof HTMLElement &&
          node.querySelector("button[aria-label$=\" panel options\"]") instanceof
            HTMLButtonElement,
      );
  const previousNavigationItem = navigationItems.at(-2);
  const lastNavigationItem = navigationItems.at(-1);
  const builtInRow = lastNavigationItem?.querySelector("button");
  const scrollContent = control?.closest("[data-sidebar=\"content\"]");
  const firstStage = document.querySelector("[data-sidebar-sticky-tier=\"label\"]");
  if (
    !(control instanceof HTMLElement) ||
    !(previousNavigationItem instanceof HTMLElement) ||
    !(lastNavigationItem instanceof HTMLElement) ||
    !(builtInRow instanceof HTMLButtonElement) ||
    !(scrollContent instanceof HTMLElement) ||
    !(firstStage instanceof HTMLElement)
  ) {
    throw new Error(
      "Could not find the thread filter, final built-in rows, and first stage.",
    );
  }

  const controlRect = control.getBoundingClientRect();
  const builtInRect = builtInRow.getBoundingClientRect();
  const previousNavigationRect = previousNavigationItem.getBoundingClientRect();
  const lastNavigationRect = lastNavigationItem.getBoundingClientRect();
  const contentRect = scrollContent.getBoundingClientRect();
  const stageRect = firstStage.getBoundingClientRect();
  const firstSection = firstStage.closest("section");
  if (
    !(firstSection instanceof HTMLElement) ||
    !(firstSection.nextElementSibling instanceof HTMLElement)
  ) {
    throw new Error("Could not find a second stage for spacing comparison.");
  }

  const controlToFirstStage = stageRect.top - controlRect.bottom;
  if (Math.abs(controlRect.height - builtInRect.height) > 0.25) {
    throw new Error(
      `Thread filter is ${controlRect.height}px tall; the final built-in row is ${builtInRect.height}px.`,
    );
  }
  const builtInRhythm =
    lastNavigationRect.top - previousNavigationRect.bottom;
  const builtInToThreadFilter = controlRect.top - lastNavigationRect.bottom;
  if (Math.abs(builtInToThreadFilter - builtInRhythm) > 0.25) {
    throw new Error(
      `Final built-in row to thread filter gap is ${builtInToThreadFilter}px; built-in row gap is ${builtInRhythm}px.`,
    );
  }
  if (contentRect.top < lastNavigationRect.bottom - 0.25) {
    throw new Error(
      `Sidebar content overlaps the final built-in row by ${lastNavigationRect.bottom - contentRect.top}px.`,
    );
  }
  const bottomHit = document.elementFromPoint(
    lastNavigationRect.left + lastNavigationRect.width / 2,
    lastNavigationRect.bottom - 0.5,
  );
  if (!(bottomHit instanceof Element) || !lastNavigationItem.contains(bottomHit)) {
    throw new Error("The final built-in row does not own its bottom rendered pixel.");
  }
  const betweenStages = Number.parseFloat(getComputedStyle(firstSection).marginBottom);
  if (Math.abs(controlToFirstStage - betweenStages) > 0.25) {
    throw new Error(
      `Thread filter gap is ${controlToFirstStage}px; stage gap is ${betweenStages}px.`,
    );
  }

  const shieldHeight = Number.parseFloat(
    getComputedStyle(firstStage, "::before").height,
  );
  const shieldTop = stageRect.top - shieldHeight;
  if (controlRect.bottom > shieldTop + 0.25) {
    throw new Error(
      `Sticky stage shield overlaps thread filter by ${controlRect.bottom - shieldTop}px.`,
    );
  }

  const cursor = getComputedStyle(control).cursor;
  if (cursor !== "pointer") {
    throw new Error(`Expected pointer cursor, received ${cursor}.`);
  }

  return JSON.stringify({
    builtInRhythm,
    builtInToThreadFilter,
    contentClearance: contentRect.top - lastNavigationRect.bottom,
    bottomPixelOwner: bottomHit.tagName,
    controlBottom: controlRect.bottom,
    controlHeight: controlRect.height,
    builtInHeight: builtInRect.height,
    controlToFirstStage,
    betweenStages,
    shieldTop,
    gap: shieldTop - controlRect.bottom,
    cursor,
  });
})()'

agent-browser --session "$qa_session" eval '(() => {
  const toggle = document.querySelector(
    "[data-sidebar-sticky-tier=\"label\"] button[aria-label^=\"Collapse \"]",
  );
  const stage = toggle?.closest("[data-sidebar-sticky-tier=\"label\"]");
  const section = stage?.closest("section");
  const labelId = section?.getAttribute("aria-labelledby");
  const label = labelId === null ? null : document.getElementById(labelId);
  const count = stage?.querySelector(
    "[aria-label$=\"threads\"], [aria-label$=\"thread\"]",
  );
  if (
    !(stage instanceof HTMLElement) ||
    !(label instanceof HTMLElement) ||
    !(toggle instanceof HTMLButtonElement)
  ) {
    throw new Error("Could not find an expanded stage label and collapse button.");
  }
  stage.setAttribute("data-qa-expanded-stage", "");

  const labelRect = label.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const labelToToggle = toggleRect.left - labelRect.right;
  window.__threadStagesStageLabelGap = labelToToggle;
  if (Math.abs(labelToToggle - 4) > 0.25) {
    throw new Error(
      `Stage toggle is ${labelToToggle}px after its label; expected the built-in 4px gap.`,
    );
  }

  const toggleStyle = getComputedStyle(toggle);
  const opacity = Number.parseFloat(toggleStyle.opacity);
  if (opacity !== 0 || toggleStyle.pointerEvents !== "none") {
    throw new Error(
      `Expanded stage toggle away from hover has opacity ${opacity} and pointer events ${toggleStyle.pointerEvents}; expected the built-in hidden state.`,
    );
  }
  if (
    Math.abs(toggleRect.width - 24) > 0.25 ||
    Math.abs(toggleRect.height - 24) > 0.25
  ) {
    throw new Error(
      `Stage toggle is ${toggleRect.width}x${toggleRect.height}px; expected the built-in 24x24px control.`,
    );
  }
  const icon = toggle.querySelector("svg");
  if (!(icon instanceof SVGElement)) {
    throw new Error("Could not find the stage chevron icon.");
  }
  const iconRect = icon.getBoundingClientRect();
  if (
    Math.abs(iconRect.width - 12) > 0.25 ||
    Math.abs(iconRect.height - 12) > 0.25
  ) {
    throw new Error(
      `Stage chevron is ${iconRect.width}x${iconRect.height}px; expected the built-in 12x12px icon.`,
    );
  }

  if (
    count instanceof HTMLElement &&
    count.getBoundingClientRect().left <= toggleRect.right
  ) {
    throw new Error("Stage count is not positioned to the right of the collapse button.");
  }

  return JSON.stringify({
    labelToToggle,
    expandedAwayOpacity: opacity,
    expandedAwayPointerEvents: toggleStyle.pointerEvents,
    toggleSize: toggleRect.width,
    iconSize: iconRect.width,
    countIsRightAligned: count instanceof HTMLElement,
  });
})()'

agent-browser --session "$qa_session" hover \
  '[data-qa-expanded-stage]' >/dev/null
agent-browser --session "$qa_session" wait 100 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const toggle = document.querySelector(
    "[data-qa-expanded-stage] button[aria-label^=\"Collapse \"]",
  );
  if (!(toggle instanceof HTMLButtonElement)) {
    throw new Error("Could not find the expanded stage toggle on hover.");
  }
  const style = getComputedStyle(toggle);
  const opacity = Number.parseFloat(style.opacity);
  if (opacity !== 1 || style.pointerEvents !== "auto") {
    throw new Error(
      `Expanded stage toggle on hover has opacity ${opacity} and pointer events ${style.pointerEvents}; expected the built-in revealed state.`,
    );
  }
  return JSON.stringify({
    expandedHoverOpacity: opacity,
    expandedHoverPointerEvents: style.pointerEvents,
  });
})()'

agent-browser --session "$qa_session" click \
  '[data-qa-expanded-stage] button[aria-label^="Collapse "]' >/dev/null
agent-browser --session "$qa_session" hover '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" wait 100 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const toggle = document.querySelector(
    "[data-qa-expanded-stage] button[aria-label^=\"Expand \"]",
  );
  if (!(toggle instanceof HTMLButtonElement)) {
    throw new Error("Stage did not collapse after a real pointer click.");
  }
  const opacity = Number.parseFloat(getComputedStyle(toggle).opacity);
  if (opacity !== 1) {
    throw new Error(
      `Collapsed stage toggle opacity is ${opacity}; expected 1 away from hover.`,
    );
  }
  return JSON.stringify({ collapsedToggleOpacity: opacity });
})()'
agent-browser --session "$qa_session" click \
  '[data-qa-expanded-stage] button[aria-label^="Expand "]' >/dev/null
agent-browser --session "$qa_session" wait 100 >/dev/null

agent-browser --session "$qa_session" eval 'document.querySelector("[data-sidebar=\"content\"]").scrollTop = 120' >/dev/null
agent-browser --session "$qa_session" wait 200 >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector("[data-thread-filter-trigger]");
  const stack = control?.closest("[data-sidebar-sticky-stack]");
  const scrollContent = control?.closest("[data-sidebar=\"content\"]");
  const controlRect = control?.getBoundingClientRect();
  const firstStage = [...document.querySelectorAll(
    "[data-sidebar-sticky-tier=\"label\"]",
  )]
    .filter(
      (stage) =>
        controlRect !== undefined &&
        stage.getBoundingClientRect().top >= controlRect.bottom - 0.25,
    )
    .sort(
      (left, right) =>
        left.getBoundingClientRect().top - right.getBoundingClientRect().top,
    )[0];
  const firstSection = firstStage?.closest("section");
  if (
    !(control instanceof HTMLElement) ||
    !(stack instanceof HTMLElement) ||
    !(scrollContent instanceof HTMLElement) ||
    !(firstStage instanceof HTMLElement) ||
    !(firstSection instanceof HTMLElement)
  ) {
    throw new Error("Could not find sticky stage layout after scrolling.");
  }

  const renderedControlRect = control.getBoundingClientRect();
  const contentRect = scrollContent.getBoundingClientRect();
  const expectedControlTop = contentRect.top + Number.parseFloat(getComputedStyle(stack).paddingTop);
  if (Math.abs(renderedControlRect.top - expectedControlTop) > 0.25) {
    throw new Error(
      `Thread filter scrolled to ${renderedControlRect.top}px; sticky top is ${expectedControlTop}px.`,
    );
  }

  const stageRect = firstStage.getBoundingClientRect();
  const betweenStages = Number.parseFloat(getComputedStyle(firstSection).marginBottom);
  const expectedStageTop = renderedControlRect.bottom + betweenStages;
  if (Math.abs(stageRect.top - expectedStageTop) > 0.25) {
    throw new Error(
      `Sticky stage top is ${stageRect.top}px; expected ${expectedStageTop}px below thread filter.`,
    );
  }

  return JSON.stringify({
    scrollTop: scrollContent.scrollTop,
    controlTop: renderedControlRect.top,
    stageTop: stageRect.top,
    betweenStages,
  });
})()'

agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector("[data-thread-filter-trigger]");
  const row = control?.parentElement;
  const stack = control?.closest("[data-sidebar-sticky-stack]");
  if (
    !(control instanceof HTMLElement) ||
    !(row instanceof HTMLElement) ||
    !(stack instanceof HTMLElement)
  ) {
    throw new Error("Could not find the populated-state thread filter layout.");
  }
  const rowRect = row.getBoundingClientRect();
  const stackRect = stack.getBoundingClientRect();
  window.__threadStagesExpectedFilterInsets = {
    left: rowRect.left - stackRect.left,
    right: stackRect.right - rowRect.right,
  };
  return JSON.stringify({
    populatedFilterInsets: window.__threadStagesExpectedFilterInsets,
  });
})()'
agent-browser --session "$qa_session" click \
  '[data-thread-filter-trigger]' >/dev/null
agent-browser --session "$qa_session" find role menuitemradio click \
  --name "$qa_empty_project_name" >/dev/null
agent-browser --session "$qa_session" wait --text \
  "No threads in this project" >/dev/null
agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector("[data-thread-filter-trigger]");
  const icon = control?.querySelector("svg");
  const label = control?.querySelector("[data-thread-filter-label]")?.textContent?.trim();
  const labelElement = control?.querySelector("[data-thread-filter-label]");
  const indicator = control?.querySelector("[data-thread-filter-indicator]");
  const stageGap = window.__threadStagesStageLabelGap;
  const iconName = icon?.getAttribute("data-icon");
  if (
    !(control instanceof HTMLButtonElement) ||
    !(icon instanceof SVGElement) ||
    !(labelElement instanceof HTMLElement) ||
    !(indicator instanceof HTMLElement) ||
    typeof stageGap !== "number" ||
    indicator.parentElement?.parentElement !== control ||
    labelElement.nextElementSibling !== indicator ||
    label === "Projects" ||
    label === "Sections and projects" ||
    (iconName !== null && iconName !== undefined && iconName !== "Folder")
  ) {
    throw new Error(
      `Unexpected selected-project control: ${JSON.stringify({
        label,
        icon: iconName ?? null,
        control: control instanceof HTMLButtonElement,
        labelElement: labelElement instanceof HTMLElement,
        indicator: indicator instanceof HTMLElement,
        indicatorParent: indicator?.parentElement?.parentElement === control,
        indicatorAfterLabel: labelElement?.nextElementSibling === indicator,
        stageGap,
      })}.`,
    );
  }
  const filterGap = indicator.getBoundingClientRect().left - labelElement.getBoundingClientRect().right;
  if (Math.abs(filterGap - stageGap) > 0.25) {
    throw new Error(
      `Filter marker is ${filterGap}px after its label; stage chevron is ${stageGap}px after its label.`,
    );
  }
  return JSON.stringify({
    selectedProjectControl: {
      label,
      icon: iconName ?? "Project icons glyph",
      filterGap,
      stageGap,
    },
  });
})()'
agent-browser --session "$qa_session" eval '(() => {
  const expected = window.__threadStagesExpectedFilterInsets;
  const control = document.querySelector("[data-thread-filter-trigger]");
  const row = control?.parentElement;
  const content = control?.closest("[data-sidebar=\"content\"]");
  if (
    typeof expected !== "object" ||
    expected === null ||
    !(control instanceof HTMLElement) ||
    !(row instanceof HTMLElement) ||
    !(content instanceof HTMLElement)
  ) {
    throw new Error("Could not find the empty-state thread filter layout.");
  }
  const rowRect = row.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const actual = {
    left: rowRect.left - contentRect.left,
    right: contentRect.right - rowRect.right,
  };
  if (
    Math.abs(actual.left - expected.left) > 0.25 ||
    Math.abs(actual.right - expected.right) > 0.25
  ) {
    throw new Error(
      `Empty-project filter insets are ${actual.left}px/${actual.right}px; populated-state insets are ${expected.left}px/${expected.right}px.`,
    );
  }
  return JSON.stringify({ emptyProjectFilterInsets: actual });
})()'
agent-browser --session "$qa_session" eval '(() => {
  const control = document.querySelector("[data-thread-filter-trigger]");
  const controlIcon = control?.querySelector("svg");
  const controlLabel = control?.querySelector("[data-thread-filter-label]");
  const messageLabel = [...document.querySelectorAll("span")].find(
    (node) => node.textContent?.trim() === "No threads in this project",
  );
  const messageRow = messageLabel?.parentElement;
  const messageIcon = messageRow?.querySelector("svg");
  if (
    !(controlIcon instanceof SVGElement) ||
    !(controlLabel instanceof HTMLElement) ||
    !(messageIcon instanceof SVGElement) ||
    !(messageLabel instanceof HTMLElement)
  ) {
    throw new Error("Could not find the thread filter and empty-state contents.");
  }
  const controlIconLeft = controlIcon.getBoundingClientRect().left;
  const controlLabelLeft = controlLabel.getBoundingClientRect().left;
  const messageIconLeft = messageIcon.getBoundingClientRect().left;
  const messageLabelLeft = messageLabel.getBoundingClientRect().left;
  if (
    Math.abs(messageIconLeft - controlIconLeft) > 0.25 ||
    Math.abs(messageLabelLeft - controlLabelLeft) > 0.25
  ) {
    throw new Error(
      `Empty-state content starts at ${messageIconLeft}px/${messageLabelLeft}px; thread filter content starts at ${controlIconLeft}px/${controlLabelLeft}px.`,
    );
  }
  return JSON.stringify({
    emptyProjectContentLeft: {
      icon: messageIconLeft,
      label: messageLabelLeft,
    },
  });
})()'
