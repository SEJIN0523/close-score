const { chromium } = require(process.env.PRISM_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const base = process.env.PRISM_BASE_URL || "http://127.0.0.1:4173/gpt/";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "");
  await page.waitForSelector("h1");
  await page.evaluate(() =>
    localStorage.setItem("claude-sentinel", "untouched"),
  );
  for (const theme of ["dark", "light"]) {
    for (const width of [320, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "home",
        "explore",
        "detail/005930",
        "portfolio",
        "settings",
      ]) {
        await page.goto(base + "#" + path);
        await page.waitForTimeout(70);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${theme} ${width} ${path} overflow`,
        );
      }
    }
    await page.locator("#theme").selectOption("light");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "#home");
  await page.screenshot({ path: "/tmp/prism-home-light.png", fullPage: true });
  await page.locator('[data-action="theme"]').click();
  await page.screenshot({ path: "/tmp/prism-home-dark.png", fullPage: true });
  await page.goto(base + "#explore");
  await page.locator("#search").fill("삼성");
  assert.equal(await page.locator(".stock-row").count(), 2);
  await page.locator("#search").fill("");
  await page.locator("#sector").selectOption({ label: "자동차" });
  assert.equal(await page.locator(".stock-row").count(), 2);
  await page.locator("#sector").selectOption("전체");
  await page.locator("#sort").selectOption("code");
  assert.equal(
    await page.locator(".stock-name small").first().textContent(),
    "000270 · KOSPI · 자동차",
  );
  await page.locator('[data-watch="005930"]').click();
  await page.locator("#only-watch").check();
  assert.equal(await page.locator(".stock-row").count(), 1);
  await page.locator('[data-compare="005930"]').check();
  assert.equal(await page.locator(".comparison>div").count(), 1);
  await page.locator(".stock-name").click();
  await page.goBack();
  assert.ok(page.url().endsWith("#explore"));
  await page.goto(base + "#portfolio");
  await page.locator('[data-action="capital"]').click();
  await page.locator("[name=capital]").fill("10000");
  await page.locator("dialog [type=submit]").click();
  async function trade(type, qty, price) {
    await page.locator('[data-action="transaction"]').click();
    await page.locator("[name=type]").selectOption(type);
    await page.locator("[name=code]").fill("005930");
    await page.locator("[name=quantity]").fill(qty);
    await page.locator("[name=price]").fill(price);
    await page.locator("dialog [type=submit]").click();
  }
  await trade("buy", "10", "100");
  assert.equal(await page.locator(".holding").count(), 1);
  await trade("sell", "11", "150");
  assert.match(await page.locator("#form-error").textContent(), /초과/);
  await page.locator("[data-close]").first().click();
  await trade("buy", "1000", "100");
  assert.match(await page.locator("#form-error").textContent(), /현금/);
  await page.locator("[data-close]").first().click();
  await trade("sell", "5", "150");
  await page.locator("[data-quote]").click();
  await page.locator("[name=price]").fill("120");
  await page.locator("dialog [type=submit]").click();
  assert.match(await page.locator(".hero-value").textContent(), /10,350/);
  await page.locator("[data-edit]").first().click();
  await page.locator("[name=price]").fill("160");
  await page.locator("dialog [type=submit]").click();
  assert.match(await page.locator(".hero-value").textContent(), /10,400/);
  await page.locator("[data-delete]").first().click();
  await page.locator("dialog [type=submit]").click();
  assert.equal(await page.locator(".ledger-row").count(), 1);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-action=backup]").click();
  const download = await downloadPromise;
  await download.saveAs("/tmp/prism-test-backup.json");
  await page.goto(base + "#settings");
  await page.locator("[data-action=reset]").click();
  await page.locator("[name=confirmation]").fill("초기화");
  await page.locator("dialog [type=submit]").click();
  await page
    .locator("#restore-file")
    .setInputFiles("/tmp/prism-test-backup.json");
  await page.locator("dialog [type=submit]").click();
  await page.locator("#target").fill("12");
  await page.locator("#target").dispatchEvent("change");
  await page.reload();
  assert.equal(await page.locator("#target").inputValue(), "12");
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("prism-v1-state")).transactions.length,
    ),
    1,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("claude-sentinel")),
    "untouched",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 50 viewport/theme/screen combinations; search/filter/sort/watch/compare/back; buy/sell rejection/edit/delete; valuation; backup/reset/restore; preferences persistence; storage isolation; zero page errors.",
  );
  await browser.close();
})();
