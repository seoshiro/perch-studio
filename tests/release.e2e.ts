import { test, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
test("200% text remains usable on phone and desktop", async ({
  browser,
}, info) => {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    await page.goto("./");
    await page.locator("html").evaluate((e) => {
      e.style.fontSize = "32px";
    });
    await expect(page.locator(".scene-canvas canvas")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await page
      .locator(".item-list")
      .getByRole("button", { name: /Two-seat sofa/ })
      .click();
    await page
      .locator(".inspector")
      .getByLabel("Width", { exact: false })
      .fill("2.4");
    await page
      .locator(".inspector")
      .getByLabel("Width", { exact: false })
      .press("Tab");
    await expect(
      page.locator(".inspector").getByLabel("Width", { exact: false }),
    ).toHaveValue("2.4");
    const inspector = await page.locator(".inspector").boundingBox(),
      footer = await page.locator(".app-footer").boundingBox();
    expect(inspector).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(footer!.y).toBeGreaterThanOrEqual(inspector!.y + inspector!.height);
    if (width === 768) {
      const title = await page.locator(".selected-title").boundingBox(),
        fields = await page
          .locator(".inspector .field-grid")
          .first()
          .boundingBox();
      expect(title!.y + title!.height).toBeLessThanOrEqual(fields!.y);
    }
    await page.screenshot({
      path: info.outputPath(`text-200-${width}.png`),
      fullPage: true,
    });
    await context.close();
  }
});
test("on-demand rendering idles, pauses offscreen, cleans contexts and preserves pagehide edits", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const w = window as typeof window & { frameCount: number };
    w.frameCount = 0;
    const native = requestAnimationFrame;
    window.requestAnimationFrame = (callback) =>
      native((time) => {
        w.frameCount++;
        callback(time);
      });
  });
  await page.goto("./");
  await expect(page.locator(".scene-canvas canvas")).toBeVisible();
  await page.waitForTimeout(700);
  const frames = () =>
    page.evaluate(
      () => (window as typeof window & { frameCount: number }).frameCount,
    );
  const start = await frames();
  await page.waitForTimeout(700);
  expect(await frames()).toBe(start);
  await page.getByRole("button", { name: "Front view", exact: true }).click();
  await page.waitForTimeout(100);
  expect(await frames()).toBeGreaterThan(start);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await page.getByRole("button", { name: "Corner view", exact: true }).click();
  await page
    .locator(".item-list")
    .getByRole("button", { name: /Two-seat sofa/ })
    .click();
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .fill("2.8");
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .press("Tab");
  await page.reload();
  await page
    .locator(".item-list")
    .getByRole("button", { name: /Two-seat sofa/ })
    .click();
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: false }),
  ).toHaveValue("2.8");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".inspector").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const offscreenStart = await frames();
  await page.getByRole("button", { name: "Move right", exact: true }).click();
  await page.waitForTimeout(500);
  expect(await frames()).toBe(offscreenStart);
  await page
    .locator(".mobile-edit-bar")
    .getByRole("button", { name: "Back to room", exact: true })
    .click();
  await page.waitForTimeout(200);
  expect(await frames()).toBeGreaterThan(offscreenStart);
  await expect(page.locator(".scene-canvas canvas")).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.locator(".scene-canvas canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator(".scene-canvas canvas")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath("rendering.json"),
    JSON.stringify(
      {
        idleFrames: start,
        offscreenFrames: offscreenStart,
        endFrames: await frames(),
        errors,
      },
      null,
      2,
    ),
  );
});
test("touch placement, visible phone editing and all furniture at the project cap", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    }),
    page = await context.newPage();
  await page.goto("./");
  await expect(page.locator(".scene-canvas canvas")).toBeVisible();
  const piece = page
    .locator(".plan-container")
    .getByRole("button", { name: /Two-seat sofa,/ });
  await piece.tap();
  await page
    .getByRole("button", { name: "Edit selected piece", exact: true })
    .click();
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: false }),
  ).toBeInViewport();
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .fill("2.6");
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .press("Tab");
  await page.getByRole("button", { name: "Back to room", exact: true }).click();
  await expect(page.locator(".scene-canvas canvas")).toBeInViewport();
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved in this browser",
  );
  const exported = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("perch.project.v1")!),
  );
  const l = exported.layouts[0],
    types = [
      "sofa",
      "armchair",
      "table",
      "chair",
      "desk",
      "bed",
      "wardrobe",
      "shelf",
      "console",
      "rug",
      "plant",
      "lamp",
    ];
  l.room = {
    width: 12,
    depth: 12,
    height: 3,
    floor: "oak",
    light: "day",
    openings: [],
  };
  l.items = Array.from({ length: 60 }, (_, i) => ({
    id: `piece-${i}`,
    kind: types[i % 12],
    x: 1 + (i % 8) * 1.3,
    y: 1 + Math.floor(i / 8) * 1.3,
    width: 0.8,
    depth: 0.8,
    height: i % 12 === 9 ? 0.015 : 1,
    rotation: (i % 4) * 90,
    finish: ["clay", "moss", "linen", "ink"][i % 4],
  }));
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "maximum.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".item-list button")).toHaveCount(60);
  await page.locator(".workspace").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: info.outputPath("sixty-pieces-phone.png"),
    fullPage: true,
  });
  await page
    .locator(".panel-tabs")
    .getByRole("button", { name: "Furniture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to room: Chair", exact: true })
    .click();
  await expect(page.getByRole("status").last()).toContainText("Up to 60");
  await expect(page.locator(".item-list button")).toHaveCount(60);
  await context.close();
});
test("production makes only same-origin asset requests and handles a denied storage getter", async ({
  browser,
}, info) => {
  const page = await browser.newPage(),
    requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("./");
  await expect(page.locator(".scene-canvas canvas")).toBeVisible();
  await page.waitForTimeout(200);
  const origin = new URL(page.url()).origin;
  expect(requests.every((u) => u.startsWith(origin + "/"))).toBe(true);
  await writeFile(
    info.outputPath("requests.json"),
    JSON.stringify(requests, null, 2),
  );
  await page.close();
  const denied = await browser.newPage();
  await denied.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Denied", "SecurityError");
      },
    });
  });
  await denied.goto("./");
  await expect(denied.locator(".save-indicator")).toContainText(
    "Storage unavailable",
  );
  await expect(denied.locator(".plan-container svg")).toBeVisible();
  await denied.close();
  const noWebGL = await browser.newPage();
  await noWebGL.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        kind: string,
        ...args: unknown[]
      ) {
        if (kind.startsWith("webgl")) return null;
        return Reflect.apply(original, this, [kind, ...args]);
      },
    });
  });
  await noWebGL.goto("./");
  await expect(noWebGL.locator(".webgl-error")).toContainText(
    "3D is unavailable",
  );
  await noWebGL
    .locator(".item-list")
    .getByRole("button", { name: /Two-seat sofa/ })
    .click();
  await expect(
    noWebGL.locator(".inspector").getByLabel("Width", { exact: false }),
  ).toHaveValue("2.2");
  await noWebGL.close();
});
test("all material/light/view presets render and export after repeated changes", async ({
  page,
}, info) => {
  await mkdir(info.outputPath("moods"), { recursive: true });
  await page.goto("./");
  await expect(page.locator(".scene-canvas canvas")).toBeVisible();
  await page
    .locator(".panel-tabs")
    .getByRole("button", { name: "Room", exact: true })
    .click();
  for (const [floor, light] of [
    ["oak", "day"],
    ["walnut", "warm"],
    ["stone", "evening"],
  ]) {
    await page
      .locator(".library-content")
      .getByLabel("Floor", { exact: true })
      .selectOption(floor);
    await page
      .locator(".library-content")
      .getByLabel("Light", { exact: true })
      .selectOption(light);
    for (const name of ["Corner view", "Front view", "Top view"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(100);
      await page
        .locator(".scene-shell")
        .screenshot({
          path: info.outputPath(`moods/${floor}-${light}-${name}.png`),
        });
    }
  }
  await page.getByRole("button", { name: "Both views", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: /Room image/ }).click();
  expect(await (await d).path()).not.toBeNull();
});
