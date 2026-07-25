/**
 * The flag must be switchable without a deploy, and must not crash on the server.
 *
 *   node --experimental-strip-types src/ops/flags.test.mjs
 */
import { builderMode, storedBuilderMode, setBuilderMode, clearBuilderMode } from "../app/lib/flags.ts";

let pass = 0, fail = 0;
const eq = (n, g, w) => { const ok = g === w; ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : ` — got ${g}, want ${w}`}`); };
const ok = (n, c) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${n}`); };

// Server render: no window at all.
eq("server with no env default → chat", builderMode(), "chat");
process.env.NEXT_PUBLIC_BUILDER_DEFAULT = "form";
eq("server with the dial turned on → form", builderMode(), "form");
delete process.env.NEXT_PUBLIC_BUILDER_DEFAULT;

// Client.
const store = new Map();
globalThis.window = {
  location: { search: "" },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};

eq("client default with no dial → chat", builderMode(""), "chat");
eq("?builder=form wins", builderMode("?builder=form"), "form");
ok("and it sticks for the next navigation", builderMode("") === "form");
eq("?builder=chat switches back", builderMode("?builder=chat"), "chat");
eq("an unknown value is ignored, not trusted", builderMode("?builder=banana"), "chat");

setBuilderMode("form");
eq("setBuilderMode persists", builderMode(""), "form");
clearBuilderMode();
eq("clearing falls back to the dial", builderMode(""), "chat");

/*
 * storedBuilderMode: the VISITOR's choice, with no environment fallback.
 *
 * The homepage redirect reads this rather than builderMode, and the difference is the
 * whole point — a rollout dial must not be able to move someone who never chose the
 * form. If these two ever collapse into one function, the dial silently starts
 * redirecting every visitor away from the page that earns the money.
 */
eq("nothing chosen → null, not a default", storedBuilderMode(""), null);
process.env.NEXT_PUBLIC_BUILDER_DEFAULT = "form";
eq("the dial does NOT count as the visitor's choice", storedBuilderMode(""), null);
delete process.env.NEXT_PUBLIC_BUILDER_DEFAULT;
eq("an explicit ?builder=form is a choice", storedBuilderMode("?builder=form"), "form");
eq("and it sticks", storedBuilderMode(""), "form");
eq("choosing chat is also a choice", storedBuilderMode("?builder=chat"), "chat");
eq("a nonsense value is not a choice", storedBuilderMode("?builder=banana"), "chat");
clearBuilderMode();
eq("clearing removes the choice entirely", storedBuilderMode(""), null);
process.env.NEXT_PUBLIC_BUILDER_DEFAULT = "form";
eq("cleared choice follows the dial, not the last choice", builderMode(""), "form");
delete process.env.NEXT_PUBLIC_BUILDER_DEFAULT;

// A hostile localStorage must not take the page down.
globalThis.window = {
  location: { search: "" },
  localStorage: {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  },
};
let threw = false;
try { eq("private mode still resolves", builderMode(""), "chat"); setBuilderMode("form"); clearBuilderMode(); }
catch { threw = true; }
ok("private browsing does not throw", !threw);

delete globalThis.window;
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
