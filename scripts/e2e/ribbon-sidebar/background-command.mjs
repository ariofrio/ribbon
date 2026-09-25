// A working thread shows its turn on the stage ring, not in the trailing lane.
// Reporting a background command gives it a trailing indicator to lay out.
export async function reportBackgroundCommand(page, threadId) {
  function update(value) {
    if (!value || typeof value !== "object") return;
    if (value.id === threadId && value.activity) {
      value.activity.activeBackgroundCommandCount = 1;
    }
    for (const child of Object.values(value)) update(child);
  }
  await page.route(/\/api\/v1\/(sidebar-bootstrap|threads(?:\/[^/?]+)?)(\?|$)/, async (route) => {
    const response = await route.fetch();
    if (!response.headers()["content-type"]?.includes("application/json")) {
      await route.fulfill({ response });
      return;
    }
    const body = await response.json();
    update(body);
    await route.fulfill({ response, json: body });
  });
}
