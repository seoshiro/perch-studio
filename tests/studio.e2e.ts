import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  clone,
  initialProject,
  parseProject,
  STORAGE_KEY,
} from "../src/model.ts";
import { translator } from "../src/i18n.ts";
import type { Locale } from "../src/i18n.ts";
import type { Page } from "@playwright/test";
const current = async (page: Page) =>
  page.evaluate((key) => {
    const p = JSON.parse(localStorage.getItem(key)!);
    return p.layouts.find((l: { id: string }) => l.id === p.currentId);
  }, STORAGE_KEY);
const settle = async (page: Page) => {
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved in this browser",
  );
};
async function open(page: Page) {
  await page.goto("./");
  await expect(page.locator(".scene-canvas canvas")).toBeVisible();
  await settle(page);
}
async function selectSofa(page: Page) {
  await page
    .locator(".item-list")
    .getByRole("button", { name: /Two-seat sofa/ })
    .click();
  await expect(page.locator(".selected-title")).toContainText("Two-seat sofa");
}
test("edit → undo → redo → local reload → independent alternatives → compare", async ({
  page,
}) => {
  await open(page);
  await selectSofa(page);
  const width = page
    .locator(".inspector")
    .getByLabel("Width", { exact: false });
  await width.fill("2.5");
  await width.press("Tab");
  await settle(page);
  expect(
    (await current(page)).items.find((i: { kind: string }) => i.kind === "sofa")
      .width,
  ).toBe(2.5);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("2.2");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(width).toHaveValue("2.5");
  await settle(page);
  await page.reload();
  await selectSofa(page);
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: false }),
  ).toHaveValue("2.5");
  await page
    .locator(".panel-tabs")
    .getByRole("button", { name: "Layouts", exact: true })
    .click();
  await page.getByRole("button", { name: "Save a copy", exact: true }).click();
  await selectSofa(page);
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .fill("1.8");
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .press("Tab");
  await settle(page);
  const p = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
  expect(p.layouts).toHaveLength(2);
  expect(
    p.layouts[0].items.find((i: { kind: string }) => i.kind === "sofa").width,
  ).toBe(2.5);
  expect(
    p.layouts[1].items.find((i: { kind: string }) => i.kind === "sofa").width,
  ).toBe(1.8);
  await page
    .getByRole("button", { name: "Compare layouts", exact: true })
    .click();
  await expect(page.locator(".compare-plan")).toHaveCount(2);
  await page
    .locator("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.locator(".variant-card").first().click();
  await selectSofa(page);
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: false }),
  ).toHaveValue("2.5");
  await page
    .getByRole("button", { name: "Delete layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.locator(".variant-card").count()).toBe(2);
  await page
    .getByRole("button", { name: "Delete layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".variant-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".variant-card")).toHaveCount(2);
});
test("JSON/SVG/PNG and printable report are real exports; import cancellation and restoration", async ({
  page,
}, info) => {
  await open(page);
  await selectSofa(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Portable project/ }).click();
  const json = await jsonDownload,
    file = await json.path();
  expect(file).not.toBeNull();
  const content = await readFile(file!, "utf8"),
    project = parseProject(content);
  expect(project.layouts[0].items).toHaveLength(7);
  await json.saveAs(info.outputPath("room.perch.json"));
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Dimensioned plan/ }).click();
  const svg = await svgDownload;
  const svgText = await readFile((await svg.path())!, "utf8");
  expect(svgText).toContain("<svg");
  expect(svgText).toContain("5.2 m");
  expect(svgText).not.toContain("onpointer");
  await svg.saveAs(info.outputPath("room-plan.svg"));
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Room image/ }).click();
  const png = await pngDownload;
  const buffer = await readFile((await png.path())!);
  expect(buffer.subarray(1, 4).toString()).toBe("PNG");
  expect(buffer.length).toBeGreaterThan(10000);
  await png.saveAs(info.outputPath("room.png"));
  await page.getByRole("button", { name: /Room report/ }).click();
  await expect(page.locator(".print-report table tbody tr")).toHaveCount(7);
  await expect(page.locator(".report-image")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: info.outputPath("room-report.pdf"),
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page
    .locator("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .fill("3");
  await page
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .press("Tab");
  await settle(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "room.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await current(page)).items.find((i: { kind: string }) => i.kind === "sofa")
      .width,
  ).toBe(3);
  await page.locator("input[type=file]").setInputFiles({
    name: "room.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await settle(page);
  const storedProject = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(await storedProject()).toEqual(project);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settle(page);
  expect(
    (await current(page)).items.find((i: { kind: string }) => i.kind === "sofa")
      .width,
  ).toBe(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await settle(page);
  expect(await storedProject()).toEqual(project);
  await page.reload();
  await selectSofa(page);
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: false }),
  ).toHaveValue("2.2");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":0}'),
  });
  await expect(page.getByRole("status").last()).toContainText(
    "not a supported",
  );
  expect(
    (await current(page)).items.find((i: { kind: string }) => i.kind === "sofa")
      .width,
  ).toBe(2.2);
});
test("precise plan dragging is transactional; cancelled and rapid moves do not lose data", async ({
  page,
}) => {
  await open(page);
  const piece = page
    .locator(".plan-container")
    .getByRole("button", { name: /Two-seat sofa,/ });
  const before = await current(page);
  const b = await piece.boundingBox();
  expect(b).not.toBeNull();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2 + 35, b!.y + b!.height / 2 + 40, {
    steps: 8,
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await settle(page);
  expect(await current(page)).toEqual(before);
  const c = await piece.boundingBox();
  await page.mouse.move(c!.x + c!.width / 2, c!.y + c!.height / 2);
  await page.mouse.down();
  await page.mouse.move(c!.x + c!.width / 2 + 20, c!.y + c!.height / 2 + 30, {
    steps: 8,
  });
  await page.mouse.up();
  await settle(page);
  const after = await current(page);
  expect(
    after.items.find((i: { kind: string }) => i.kind === "sofa").y,
  ).not.toBe(before.items.find((i: { kind: string }) => i.kind === "sofa").y);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settle(page);
  expect(await current(page)).toEqual(before);
  await piece.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("r");
  await settle(page);
  const item = (await current(page)).items.find(
    (i: { kind: string }) => i.kind === "sofa",
  );
  expect(item.rotation).toBe(15);
  expect(item.y).toBe(0.82);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await settle(page);
  expect(await current(page)).toEqual(before);
  await selectSofa(page);
  for (let i = 0; i < 12; i++) {
    await page.getByRole("button", { name: "Move right", exact: true }).click();
    await page.getByRole("button", { name: "Move left", exact: true }).click();
  }
  await settle(page);
  expect(
    (await current(page)).items.find((i: { kind: string }) => i.kind === "sofa")
      .x,
  ).toBe(2.6);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".item-list button")).toHaveCount(8);
  await page.getByRole("button", { name: "Delete piece", exact: true }).click();
  await expect(page.locator(".item-list button")).toHaveCount(7);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".item-list button")).toHaveCount(8);
  await settle(page);
  await page.reload();
  await expect(page.locator(".item-list button")).toHaveCount(8);
});
test("room shrink and rotated boundaries show fit notes; numeric errors remain editable", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".panel-tabs")
    .getByRole("button", { name: "Room", exact: true })
    .click();
  const width = page
    .locator(".library-content")
    .getByLabel("Width", { exact: false })
    .first();
  await width.fill("3");
  await width.press("Tab");
  await expect(page.locator(".fit-panel")).toContainText("extends beyond");
  await width.fill("NaN");
  await width.press("Tab");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await width.fill("5.2");
  await width.press("Tab");
  await expect(width).toHaveAttribute("aria-invalid", "false");
  await selectSofa(page);
  await page
    .locator(".inspector")
    .getByLabel("Rotation", { exact: false })
    .fill("90");
  await page
    .locator(".inspector")
    .getByLabel("Rotation", { exact: false })
    .press("Tab");
  await expect(page.locator(".fit-panel")).toContainText("extends beyond");
  await page.getByRole("button", { name: "Move down", exact: true }).click();
  await settle(page);
  const item = (await current(page)).items.find(
    (i: { kind: string }) => i.kind === "sofa",
  );
  expect(item.y).toBeGreaterThanOrEqual(1.1);
});
test("fallback, failed storage, valid backup recovery and preserved corrupt data", async ({
  browser,
}) => {
  const no3d = await browser.newPage();
  await no3d.goto("./?no3d");
  await expect(
    no3d.getByText("3D is unavailable on this device.", { exact: false }),
  ).toBeVisible();
  await selectSofa(no3d);
  await no3d
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .fill("2.7");
  await no3d
    .locator(".inspector")
    .getByLabel("Width", { exact: false })
    .press("Tab");
  await settle(no3d);
  expect(
    (await current(no3d)).items.find((i: { kind: string }) => i.kind === "sofa")
      .width,
  ).toBe(2.7);
  await no3d.close();
  const denied = await browser.newPage();
  await denied.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await denied.goto("./");
  await expect(denied.locator(".save-indicator")).toContainText(
    "Storage unavailable",
  );
  await selectSofa(denied);
  await denied.getByRole("button", { name: "Export", exact: true }).click();
  const d = denied.waitForEvent("download");
  await denied.getByRole("button", { name: /Portable project/ }).click();
  expect(await (await d).path()).not.toBeNull();
  await denied.close();
  const recovered = await browser.newPage();
  await recovered.addInitScript(() => {
    const p = {
      app: "perch",
      version: 1,
      name: "Recovered room",
      updatedAt: new Date().toISOString(),
      currentId: "a",
      layouts: [
        {
          id: "a",
          name: "Backup",
          room: {
            width: 4,
            depth: 4,
            height: 2.7,
            floor: "oak",
            light: "day",
            openings: [],
          },
          items: [],
        },
      ],
    };
    localStorage.setItem("perch.project.v1", "broken");
    localStorage.setItem("perch.backup.v1", JSON.stringify(p));
  });
  await recovered.goto("./");
  await expect(recovered.locator(".notice")).toContainText(
    "Recovered the last valid backup",
  );
  await expect(recovered.getByLabel("Project name")).toHaveValue(
    "Recovered room",
  );
  await recovered.close();
  const broken = await browser.newPage();
  await broken.addInitScript(() => {
    localStorage.setItem("perch.project.v1", "broken");
    localStorage.setItem("perch.backup.v1", "broken-backup");
  });
  await broken.goto("./");
  await expect(broken.locator(".notice")).toContainText(
    "saved project could not be read",
  );
  await broken.waitForTimeout(700);
  expect(
    await broken.evaluate(() => localStorage.getItem("perch.project.v1")),
  ).toBe("broken");
  await broken
    .getByRole("button", { name: "Save this demo", exact: true })
    .click();
  await settle(broken);
  expect(
    await broken.evaluate(() => localStorage.getItem("perch.project.v1")),
  ).toContain('"app":"perch"');
  await broken.close();
});
test("EN/RU/KK, modal focus, reduced motion and meaningful accessible controls", async ({
  page,
}) => {
  await open(page);
  await selectSofa(page);
  for (const [locale, label] of [
    ["ru", "Выбранный предмет"],
    ["kk", "Таңдалған зат"],
    ["en", "Selected piece"],
  ]) {
    await page
      .getByRole("combobox", {
        name: /Interface language|Язык интерфейса|Интерфейс тілі/,
      })
      .selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator(".inspector-heading")).toContainText(label);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  await page
    .getByRole("button", { name: "How to use", exact: true })
    .first()
    .click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () =>
        document.activeElement === document.body ||
        document.activeElement?.closest("dialog") !== null,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".catalog-card")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
});
test("viewport/DPR/orientation matrix has no horizontal overflow or canvas loss", async ({
  browser,
}, info) => {
  await mkdir(info.outputPath("screens"), { recursive: true });
  const results = [];
  for (const [width, height, dpr] of [
    [320, 720, 1],
    [360, 800, 2],
    [390, 844, 3],
    [414, 896, 2],
    [720, 320, 1],
    [800, 360, 2],
    [844, 390, 3],
    [896, 414, 2],
    [768, 1024, 2],
    [1024, 768, 1],
    [1440, 1000, 1],
    [1920, 1080, 2],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: dpr,
      isMobile: width < 700,
      hasTouch: width < 1000,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    await expect(page.locator(".scene-canvas canvas")).toBeVisible();
    const geometry = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
      canvases: [...document.querySelectorAll("canvas")].map((c) => ({
        width: c.width,
        height: c.height,
        cssWidth: c.getBoundingClientRect().width,
        cssHeight: c.getBoundingClientRect().height,
      })),
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(width + 1);
    expect(
      geometry.canvases[0].width / geometry.canvases[0].cssWidth,
    ).toBeLessThanOrEqual(1.61);
    await page.screenshot({
      path: info.outputPath(`screens/${width}-${height}-${dpr}.png`),
      fullPage: true,
    });
    results.push({ width, height, dpr, geometry, errors });
    expect(errors).toEqual([]);
    await context.close();
  }
  await writeFile(
    info.outputPath("viewport-matrix.json"),
    JSON.stringify(results, null, 2),
  );
});
test("localized phone measurement labels, numeric counts and fallback exports stay usable", async ({
  page,
}) => {
  const project = initialProject(),
    base = clone(project.layouts[0]);
  const counts = [
    [1, "предмет"],
    [2, "предмета"],
    [5, "предметов"],
    [11, "предметов"],
    [21, "предмет"],
  ] as const;
  project.layouts = counts.map(([n]) => ({
    ...clone(base),
    id: `qa-layout-${n}`,
    name: `My layout ${n} - Copy`,
    items: Array.from({ length: n }, (_, i) => ({
      ...clone(base.items[i % base.items.length]),
      id: `qa-piece-${n}-${i}`,
    })),
  }));
  project.currentId = project.layouts[0].id;
  await page.addInitScript(
    ({ key, project }) => localStorage.setItem(key, JSON.stringify(project)),
    { key: STORAGE_KEY, project },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?no3d");
  for (const locale of ["en", "ru", "kk"] as Locale[]) {
    await page.locator("header select").selectOption(locale);
    const t = translator(locale),
      checkbox = page.getByRole("checkbox", {
        name: t("measure"),
        exact: true,
      });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(page.locator(".plan-container .plan-dimensions")).toHaveCount(
      0,
    );
    await checkbox.check();
    await expect(page.locator(".plan-container .plan-dimensions")).toHaveCount(
      1,
    );
    await page.getByRole("button", { name: t("export"), exact: true }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(t("png")) }),
    ).toBeDisabled();
    await expect(page.locator("#png-export-note")).toHaveText(
      t("imageUnavailable"),
    );
    await expect(
      page.getByRole("button", { name: new RegExp(t("json")) }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: new RegExp(t("svg")) }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: new RegExp(t("report")) }),
    ).toBeEnabled();
    if (locale === "ru") {
      const svgDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: new RegExp(t("svg")) }).click();
      expect(await (await svgDownload).path()).not.toBeNull();
    }
    await page
      .locator("dialog")
      .getByRole("button", { name: t("close"), exact: true })
      .click();
  }
  await page.locator("header select").selectOption("ru");
  const t = translator("ru");
  await page
    .locator(".panel-tabs")
    .getByRole("button", { name: t("layouts"), exact: true })
    .click();
  for (const [n, noun] of counts) {
    const card = page
      .locator(".variant-card")
      .filter({ hasText: `My layout ${n} - Copy` });
    await expect(card).toContainText(`${n} ${noun}`);
    await expect(card.locator("strong")).toHaveText(`My layout ${n} - Copy`);
  }
  await page.getByRole("button", { name: t("compare"), exact: true }).click();
  await expect(page.locator(".compare-stats").first()).toContainText(
    "1предмет",
  );
  await expect(page.locator(".compare-stats").last()).toContainText(
    "2предмета",
  );
  await page
    .locator("dialog")
    .getByRole("button", { name: t("close"), exact: true })
    .click();
  await page
    .locator(".variant-card")
    .filter({ hasText: "My layout 21 - Copy" })
    .click();
  await page.getByRole("button", { name: t("export"), exact: true }).click();
  await page.getByRole("button", { name: new RegExp(t("report")) }).click();
  await expect(page.locator(".print-report h2").first()).toHaveText(
    "Мебель · 21 предмет",
  );
  await expect(page.locator(".report-plan svg")).toBeVisible();
  await expect(page.locator(".report-image")).toHaveCount(0);
});
