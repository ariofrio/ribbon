import assert from "node:assert/strict";
import { chromium } from "playwright";
import { freezeLoopingAnimations } from "../screenshots/capture.mjs";

export async function verifyScreenshotAnimations() {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
      </style>
      <div class="spinner"></div>
    `);
    await freezeLoopingAnimations(page);
    await page.evaluate(() => {
      document.body.append(document.querySelector(".spinner").cloneNode());
    });
    await page.waitForFunction(
      () => document.getAnimations().every((animation) => animation.playState === "paused"),
      null,
      { timeout: 5000 },
    );
    assert.deepEqual(
      await page.locator(".spinner").evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).transform),
      ),
      ["matrix(1, 0, 0, 1, 0, 0)", "matrix(1, 0, 0, 1, 0, 0)"],
    );
  } finally {
    await browser.close();
  }
}
