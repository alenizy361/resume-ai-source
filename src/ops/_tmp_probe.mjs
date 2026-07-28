import { chromium } from "playwright-core";
const BASE = "http://localhost:3000";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

/* ─────────── 1. focus behaviour in checkout modal ─────────── */
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Unlock unlimited/.test(b.textContent)).click());
  await page.waitForTimeout(600);
  const seq = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    seq.push(await page.evaluate(() => {
      const a = document.activeElement;
      const inDialog = !!a.closest("[role=dialog]");
      return `${inDialog ? "IN " : "OUT"} ${a.tagName}${a.id ? "#" + a.id.split("-").slice(0,2).join("-") : ""}:${(a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 28)}`;
    }));
  }
  console.log("=== 1. TAB ORDER with checkout modal open (desktop /pricing) ===");
  seq.forEach((s, i) => console.log(`  tab${i + 1}: ${s}`));
  const outCount = seq.filter((s) => s.startsWith("OUT")).length;
  console.log(`  OUT-of-dialog stops in first 10 tabs: ${outCount}`);
  await page.close();
}

/* ─────────── 2. dashed Saudi mobile in AR modal ─────────── */
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const net = [];
  page.on("response", async (r) => { if (r.url().includes("/api/pay")) net.push(`${r.status()} ${(await r.text().catch(()=>"")).slice(0,160)}`); });
  await page.goto(BASE + "/ar/pricing", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /الحزمة الكاملة/.test(b.textContent)).click());
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const d = document.querySelector("[role=dialog]");
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    const ins = [...d.querySelectorAll("input")];
    set(ins[0], "أحمد الفهد"); set(ins[1], "ahmed@email.com"); set(ins[2], "055-123-4567");
  });
  await page.evaluate(() => document.querySelector("[role=dialog] button[type=submit]").click());
  await page.waitForTimeout(2500);
  console.log("\n=== 2. AR modal, Saudi mobile written with dashes 055-123-4567 ===");
  console.log("  server:", net.join(" | "));
  console.log("  shown to user:", await page.evaluate(() => {
    const d = document.querySelector("[role=dialog]");
    return [...d.querySelectorAll("div")].filter((x) => /rgba?\(220, 38, 38/.test(getComputedStyle(x).backgroundColor)).map(x=>x.innerText).join(" | ");
  }));
  await page.close();
}

/* ─────────── 3. /pay/callback references ─────────── */
{
  const cases = [
    ["no transactionNo", "/pay/callback"],
    ["no transactionNo (ar)", "/pay/callback?lang=ar"],
    ["unknown ref", "/pay/callback?transactionNo=1234567890123"],
    ["unknown ref ar", "/pay/callback?transactionNo=1234567890123&lang=ar"],
    ["injection-ish ref", "/pay/callback?transactionNo=%3Cscript%3Ealert(1)%3C%2Fscript%3E"],
    ["empty ref", "/pay/callback?transactionNo="],
    ["lowercase key", "/pay/callback?TransactionNo=999999"],
  ];
  console.log("\n=== 3. /pay/callback ===");
  for (const [label, url] of cases) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const codes = [];
    page.on("response", (r) => { if (r.url().includes("/api/pay/verify")) codes.push(r.status()); });
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const txt = await page.evaluate(() => document.querySelector("main")?.innerText.replace(/\n+/g, " | ") || document.body.innerText.slice(0,200));
    console.log(`  ${label.padEnd(24)} verify=${codes.join(",") || "-"}  ::  ${txt.slice(0, 230)}`);
    // click refresh twice = replay
    if (/Refresh status|تحديث الحالة/.test(txt)) {
      await page.evaluate(() => [...document.querySelectorAll("button")].find(b=>/Refresh status|تحديث الحالة/.test(b.textContent)).click());
      await page.waitForTimeout(2500);
      const t2 = await page.evaluate(() => document.querySelector("main").innerText.replace(/\n+/g," | "));
      console.log(`      after replay/refresh: ${t2.slice(0, 200)}`);
    }
    await page.close();
  }
}

/* ─────────── 4. client-trusted entitlement attempt ─────────── */
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE + "/optimize", { waitUntil: "networkidle" });
  console.log("\n=== 4. entitlement: what /api/auth/me says, and can storage override it ===");
  console.log("  /api/auth/me:", await page.evaluate(() => fetch("/api/auth/me").then(r=>r.text())));
  // plant a fake paid result + ra_owned and see what unlocks
  await page.evaluate(() => {
    sessionStorage.setItem("ra_visit_session", "1");
    localStorage.setItem("ra_owned:anon", '"1"');
    localStorage.setItem("ra_optimize_result:anon", JSON.stringify({
      matchScore: 88, afterScore: 95, matchSummary: "planted", missingKeywords: ["k8s"], presentKeywords: ["react"],
      skillsGap: ["terraform"], improvements: [{ area: "Summary", issue: "x", fix: "y" }],
      optimizedResume: "PLANTED OPTIMIZED RESUME TEXT\nline2\nline3", locked: false, watermark: false,
    }));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.body.innerText);
  console.log("  planted result rendered?", /PLANTED OPTIMIZED RESUME TEXT/.test(body));
  console.log("  watermark upsell block shown (means treated as FREE)?", /Download a clean|Remove watermark|حمّل نسخة نظيفة/.test(body));
  console.log("  cover-letter shown as unlockable (paid) or gated?", /Unlock to generate|افتح الوصول لإنشائه/.test(body) ? "GATED (correct)" : "UNGATED");
  // .txt download watermark check
  const dl = await page.evaluate(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => /↓ \.txt|↓ نص/.test(x.textContent));
    if (!b) return "(no txt button)";
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (blob) => { captured = blob; return orig.call(URL, blob); };
    b.click();
    await new Promise((r) => setTimeout(r, 300));
    URL.createObjectURL = orig;
    return captured ? await captured.text() : "(no blob)";
  });
  console.log("  .txt download content:", JSON.stringify(String(dl).slice(0, 120)));
  // /api/export with no cookies
  console.log("  POST /api/export watermark verdict:", await page.evaluate(() => fetch("/api/export", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"A\nB\nC",format:"pdf",lang:"en"})}).then(r=>r.status+" "+r.headers.get("content-type")+" len="+r.headers.get("content-length"))));
  // cookie forging attempt
  console.log("  forging ra_access cookie:", await page.evaluate(() => { document.cookie = "ra_access=paid.9999999999999.single; path=/"; return document.cookie; }));
  console.log("  /api/auth/me after forge:", await page.evaluate(() => fetch("/api/auth/me").then(r=>r.text())));
  await page.close();
}

await browser.close();
