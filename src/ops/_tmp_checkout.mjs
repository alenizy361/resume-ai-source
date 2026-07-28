import { chromium } from "playwright-core";
const BASE = "http://localhost:3000";

const openModal = async (page, idx = 0) => {
  const n = await page.evaluate((i) => {
    const bs = [...document.querySelectorAll("button")].filter((b) => /Get |Buy|Unlock|اشترِ|احصل|افتح|أزل|Complete Pack|الحزمة/.test(b.textContent) && !b.closest('[role=dialog]'));
    if (!bs[i]) return "NONE:" + bs.map(b=>b.textContent.trim()).join(" ~ ");
    bs[i].scrollIntoView(); bs[i].click(); return bs[i].textContent.trim();
  }, idx);
  await page.waitForTimeout(700);
  return n;
};

const modalInfo = (page) => page.evaluate(() => {
  const d = document.querySelector("[role=dialog]");
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return {
    dir: d.getAttribute("dir"),
    ariaModal: d.getAttribute("aria-modal"),
    label: d.getAttribute("aria-label"),
    text: d.innerText,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport: r.top >= -1 && r.bottom <= window.innerHeight + 1,
    fields: [...d.querySelectorAll("input")].map((i) => ({ id: i.id, type: i.type, req: i.required, ph: i.placeholder })),
    focused: document.activeElement ? (document.activeElement.tagName + "#" + (document.activeElement.id || "") + "." + (document.activeElement.className||"").slice(0,30)) : "none",
    bodyOverflow: getComputedStyle(document.body).overflow,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
  };
});

async function run(path, vp) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const net = [];
  page.on("response", async (r) => { if (r.url().includes("/api/pay")) net.push(`${r.status()} ${r.url()} -> ${(await r.text().catch(()=>"")).slice(0,220)}`); });
  console.log(`\n\n########## ${path} @ ${vp.width}x${vp.height} ##########`);
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const clicked = await openModal(page, 0);
  console.log("trigger clicked:", clicked);
  let m = await modalInfo(page);
  if (!m) { console.log("NO MODAL"); await browser.close(); return; }
  console.log("modal dir=", m.dir, "aria-modal=", m.ariaModal, "label=", m.label);
  console.log("rect", JSON.stringify(m.rect), "inViewport", m.inViewport);
  console.log("bodyOverflow", m.bodyOverflow, "htmlOverflow", m.htmlOverflow);
  console.log("focused element on open:", m.focused);
  console.log("fields:", JSON.stringify(m.fields));
  console.log("--- modal text ---\n" + m.text + "\n---");

  // language check
  const arChars = (m.text.match(/[؀-ۿ]/g) || []).length;
  const latin = (m.text.match(/[A-Za-z]/g) || []).length;
  console.log(`LANG: arabicChars=${arChars} latinChars=${latin}`);

  // Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  console.log("after Escape, modal present?", !!(await modalInfo(page)));
  console.log("  bodyOverflow restored:", await page.evaluate(() => getComputedStyle(document.body).overflow));

  // reopen + scrim click
  await openModal(page, 0);
  await page.mouse.click(3, 3);
  await page.waitForTimeout(400);
  console.log("after scrim click, modal present?", !!(await modalInfo(page)));

  // ── validation matrix ──
  const cases = [
    ["empty", "", "", ""],
    ["whitespace-only", "   ", "   ", "   "],
    ["malformed email", "Ahmed Fahad", "not-an-email", "0551234567"],
    ["saudi mobile no +966", "Ahmed Fahad", "a@b.com", "0551234567"],
    ["saudi mobile with +966", "Ahmed Fahad", "a@b.com", "+966551234567"],
    ["mobile with letters", "Ahmed Fahad", "a@b.com", "abcdefgh"],
    ["1-char name", "A", "a@b.com", "0551234567"],
  ];
  for (const [label, nm, em, mb] of cases) {
    await openModal(page, 0);
    const d = "[role=dialog]";
    await page.evaluate(({ nm, em, mb }) => {
      const d = document.querySelector("[role=dialog]");
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
      const ins = [...d.querySelectorAll("input")];
      set(ins[0], nm); set(ins[1], em); set(ins[2], mb);
    }, { nm, em, mb });
    await page.waitForTimeout(200);
    const before = net.length;
    await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); d.querySelector("button[type=submit]").click(); });
    await page.waitForTimeout(2500);
    const inline = await page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      if (!d) return "(modal gone)";
      const e = [...d.querySelectorAll("div")].filter((x) => /rgba?\(220, 38, 38/.test(getComputedStyle(x).backgroundColor));
      return e.length ? e.map(x=>x.innerText).join(" | ") : "(no inline error)";
    });
    const bv = await page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      if (!d) return "-";
      const bad = [...d.querySelectorAll("input")].filter((i) => !i.checkValidity());
      return bad.length ? "browser-blocked:" + bad.map(i=>i.id.split("-")[1]).join(",") : "browser-ok";
    });
    const submitLabel = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); return d ? d.querySelector("button[type=submit]")?.textContent.trim() : "-"; });
    console.log(`CASE ${label.padEnd(22)} | ${bv.padEnd(28)} | inline=${inline} | submit="${submitLabel}" | apiCalls=${net.length - before}`);
    if (net.length > before) console.log("     NET:", net.slice(before).join("\n     "));
    // close
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    if (await modalInfo(page)) await page.evaluate(() => { const b=[...document.querySelectorAll("[role=dialog] button")].find(x=>/Cancel|إلغاء/.test(x.textContent)); if(b) b.click(); });
    await page.waitForTimeout(300);
  }

  console.log("all /api/pay traffic:\n" + net.join("\n"));
  await browser.close();
}

await run(process.argv[2] || "/pricing", { width: Number(process.argv[3]||1280), height: Number(process.argv[4]||800) });
