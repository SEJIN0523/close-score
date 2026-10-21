const { chromium } = require(process.env.PRISM_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const base =
  process.env.PRISM_BASE_URL || "http://127.0.0.1:4174/close-score/prism/";
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
  const p = await context.newPage(),
    errors = [],
    uploads = [];
  p.on("pageerror", (e) => errors.push(e.message));
  context.on("request", (r) => {
    if (r.method() !== "GET") uploads.push(r.url());
  });
  await p.goto(base + "#settings");
  await p.waitForSelector("#target");
  await p.evaluate(() => {
    localStorage.setItem("close-score-theme", "dark");
    localStorage.setItem("close-score-portfolio", "CLAUDE-UNCHANGED");
  });
  await p.locator("[data-action=capital]").click();
  await p.locator("[name=capital]").fill("1234");
  await p.locator("dialog [type=submit]").click();
  const old = await p.evaluate(() => localStorage.getItem("prism-v1-state"));
  const next = JSON.parse(old);
  next.initialCash = 9999;
  const file = {
    name: "prism.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(next)),
  };
  await p.locator("#restore-file").setInputFiles(file);
  await p.locator("dialog [data-close]").first().click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("prism-v1-state")),
    old,
  );
  await p
    .locator("#restore-file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
  await p.waitForTimeout(100);
  assert.equal(
    await p.evaluate(() => localStorage.getItem("prism-v1-state")),
    old,
  );
  await p.locator("#restore-file").setInputFiles(file);
  await p.locator("dialog [type=submit]").click();
  assert.equal(
    await p.evaluate(
      () => JSON.parse(localStorage.getItem("prism-v1-state")).initialCash,
    ),
    9999,
  );
  const dl = p.waitForEvent("download");
  await p.locator("[data-action=recovery]").click();
  await (await dl).saveAs("/tmp/prism-v11-recovery.json");
  assert.deepEqual(
    JSON.parse(
      require("node:fs").readFileSync("/tmp/prism-v11-recovery.json", "utf8"),
    ),
    JSON.parse(old),
  );
  await p.reload();
  assert.equal(
    await p.evaluate(
      () => JSON.parse(localStorage.getItem("prism-v1-before-restore")).raw,
    ),
    old,
  );
  await p.locator("#restore-file").setInputFiles(file);
  const other = await context.newPage();
  await other.goto(base + "#settings");
  await other.locator("#target").fill("17");
  await other.locator("#target").dispatchEvent("change");
  await p.locator("dialog [type=submit]").click();
  assert.match(await p.locator("#form-error").textContent(), /다른 탭/);
  await p.locator("dialog [data-close]").first().click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("close-score-theme")),
    "dark",
  );
  assert.equal(
    await p.evaluate(() => localStorage.getItem("close-score-portfolio")),
    "CLAUDE-UNCHANGED",
  );
  assert.equal(await p.locator("link[rel=manifest]").count(), 0);
  assert.equal(
    await p.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
    0,
  );
  for (const width of [320, 390, 430, 768, 1440]) {
    await p.setViewportSize({ width, height: 844 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  await p.locator("[data-action=reset]").click();
  await p.locator("[name=confirmation]").fill("초기화");
  await p.locator("dialog [type=submit]").click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("prism-v1-before-restore")),
    null,
  );
  assert.equal(
    await p.evaluate(() => localStorage.getItem("close-score-portfolio")),
    "CLAUDE-UNCHANGED",
  );
  console.log(
    "PASS: staged /close-score/prism/, cancel/invalid restore, recovery download/reload, cross-tab conflict, Claude keys, mobile restore UI, no manifest/registration/upload, reset cleanup",
  );
  await browser.close();
})();
