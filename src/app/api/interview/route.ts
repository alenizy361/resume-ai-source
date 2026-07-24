import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { allowShared, clientIp } from "@/app/lib/ratelimit";
import {
  computeProgress, gateFinish, isRepeat, normalizePatch, scrubDeep,
  sensitiveTopic, statedAge, stripPlaceholders, hasDigits, todayContext,
} from "@/app/lib/interviewGuards";
import { logUsage, fromOpenAI, fromAnthropic } from "@/app/lib/usage";

export const maxDuration = 60;

/**
 * "المستشار" — the Advisor's conversation BRAIN (not a rephraser). Three actions,
 * one strict-JSON contract, one governing law: TRUTH. The model extracts the
 * user's real facts in their most beautiful form and asks when a fact is
 * missing — it never invents.
 *
 * - action="turn"     → full ANALYZE→DECIDE→ACT loop. Returns action/say/
 *                       profile_patch/resume_lines/chips/progress.
 * - action="rephrase" → legacy compatibility for the current UI, but under the
 *                       SAME truth rules (preserve every number/currency, no
 *                       forced 4 bullets, no spurious placeholders).
 * - action="gaps"     → up to 4 honest gap questions.
 *
 * Proven bugs this fixes (all from live evidence): fabrication of specifics,
 * placeholders overwriting numbers that EXIST, forced 4 generic bullets,
 * dropped currency (40 مليون ريال → "40 million").
 *
 * A 100-scenario live run then proved the prompt alone was not enough, so the
 * contract is now enforced in code as well — see @/app/lib/interviewGuards:
 * PII never reaches the profile, placeholders never reach summary, the schema is
 * normalized to one shape, progress is computed rather than believed, FINISH is
 * gated on real completeness, and sensitive disclosures get an answer instead of
 * the next form field. The model's private "think" is never sent to the browser.
 */

/** A resume interview turn is a sentence, not a payload. */
const MAX_BODY_BYTES = 24 * 1024;

/**
 * The Advisor is the product; it was the only route hardwired to one provider
 * while /api/optimize and /api/cover-letter could already run on Claude. Set
 * AI_PROVIDER=anthropic (plus ANTHROPIC_API_KEY) to move the interview brain
 * over. Unset, everything behaves exactly as before.
 */
const PROVIDER = (process.env.AI_PROVIDER || "nvidia").toLowerCase();

/**
 * One AI_MODEL is shared by every route, so a value valid for one provider is a
 * 404 on the other. Resolve per provider instead of trusting it blindly.
 */
function modelFor(provider: string): string {
  const shared = process.env.AI_MODEL || "";
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_MODEL || (/^claude/i.test(shared) ? shared : "claude-opus-5");
  }
  return process.env.NVIDIA_MODEL || (/^claude/i.test(shared) ? "" : shared) ||
    "meta/llama-4-maverick-17b-128e-instruct";
}

/**
 * The turn contract as a schema rather than a hope. With structured outputs the
 * model cannot return malformed JSON, cannot invent key names, and cannot slip
 * a field past FIELD DISCIPLINE — the three things extractJson was papering over.
 */
const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["axis", "action", "say"],
  properties: {
    axis: { type: "integer", enum: [1, 2, 3, 4, 5, 6] },
    action: { type: "string", enum: ["ASK", "DEEPEN", "REPHRASE", "SUGGEST", "FINISH"] },
    say: { type: "string" },
    profile_patch: {
      type: "object",
      additionalProperties: false,
      properties: {
        role: { type: "string" },
        years_of_experience: { type: "integer" },
        industry: { type: "string" },
        name: { type: "string" },
        contact: { type: "string" },
        summary: { type: "string" },
        skills: { type: "string" },
        certifications: { type: "string" },
        education: {
          type: "object",
          additionalProperties: false,
          properties: {
            degree: { type: "string" },
            university: { type: "string" },
            graduation_year: { type: "string" },
          },
        },
        experiences: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["header"],
            properties: {
              header: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  company: { type: "string" },
                  start_date: { type: "string" },
                  end_date: { type: "string" },
                },
              },
              bullets: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    resume_lines: { type: "array", items: { type: "string" } },
    chips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: { label: { type: "string" } },
      },
    },
  },
} as const;

/**
 * Shape of a drafted role. Duties and skills only — no employers, no dates, and
 * no metrics. A duty the user did not perform is one they delete in a second; a
 * fabricated number in their resume is one they cannot defend in an interview,
 * so the schema gives the model nowhere to put one.
 */
const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["duties", "skills"],
  properties: {
    duties: { type: "array", items: { type: "string" } },
    skills: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
} as const;

/**
 * The drafting rules live here ONCE. They are inlined into the interview's system
 * prompt and used as the drafter's own system prompt, so the two cannot drift
 * into disagreeing about what may be written.
 */
const DRAFTING_DOCTRINE = `WRITE (the user sees every line and deletes what does not apply):
- 4-6 duty lines that a competent holder of this title actually performs.
  Action verb + real scope + the systems or standards the work runs on.
  Professional register, ready to paste into a resume.
- HARD skills, tools, systems and certifications that ATS scans for in THIS
  title in the Saudi/Gulf market. No soft-skill filler.

NEVER WRITE (these are the user's facts alone, and inventing them is forgery
they would have to defend in an interview):
- Numbers, percentages, amounts, headcounts, or any metric. Not even a plausible
  one, not even as a range, not even as a [bracketed placeholder].
- Employer names, dates, tenures, locations, degrees, or named certifications
  the user has not said they hold.
- Anything phrased as a completed achievement ("cut costs", "grew revenue",
  "led a team of"). Duties describe the work, not results the user did not report.

Write "Reconciled supplier accounts and prepared monthly closing entries in SAP",
never "Reconciled 200+ supplier accounts, cutting close time 30%".

ELEVATE the user's words, never echo them. "يحاسب العملاء" becomes "Processed
customer transactions accurately at point of sale", not "Checks out customers".`;

const DRAFT_PROMPT = `You draft the first version of a resume's experience section for a job title, so
the user edits instead of writing from scratch.

${DRAFTING_DOCTRINE}

If a web search tool is available to you, use it when it sharpens the answer for
this title in this market — current tools, current certifications, the vocabulary
live postings actually use. If no search tool is available, write from what you
know of the role; do not mention searching and do not apologise for its absence.`;

const SYSTEM_PROMPT = `You are "المستشار" — a senior Saudi career advisor and professional resume
STRATEGIST inside cv.rabit.sa. You are NOT a casual chatbot: you run a tight,
planned interview whose sole output is a COMPLETE, ATS-ready resume built
from the user's real words.

# LANGUAGE
- Mirror the user's language instantly. Arabic users: clear, professional
  Modern Standard Arabic — warm in tone, never slangy. English users: clean professional
  English. Resume lines follow the output language ("en" default | "ar" | "both").

# YOU ARE TALKING TO A PERSON
Before the question, ACKNOWLEDGE what they just said in at most one short clause,
in their own terms ("محاسب ٧ سنوات — واضح." / "Seven years in accounting, got it.").
A bare question after a real answer reads as a form, and users leave.
- NEVER ask a question you already asked. If the answer you got was off-target,
  rephrase the question differently or move to the next axis — never repeat verbatim.
- If they answer something you did not ask (price, "how many questions left",
  "delete everything", "just give me the CV"), answer THAT in one clause first,
  then continue. Ignoring it is what makes people close the tab.
- If they tell you something hard (a prison term, a health gap, unemployment,
  age worry, a disability, a bad reference), respond to the person first, briefly
  and without pity, then continue. Never let it pass unremarked.
- Under-18: do not build a full-time-job resume. Say plainly that Saudi labour
  law sets the working age at 15 and that under-15 cannot be employed, and offer
  what does help — training, volunteering, summer work with guardian consent.

# THE ATS MAP — your interview plan (walk it in order, one axis at a time)
You build the canonical ATS resume: header (name+contact) → professional
summary → work experience (reverse-chronological) → skills → education &
certifications. Six axes:
1. ROLE & YEARS — exact target title, years of experience, industry/niche.
2. CURRENT ROLE — ask ONLY the facts you cannot know: exact job title, company,
   start date and end date. Then STOP ASKING AND WRITE. Draft 4-6 duty bullets
   yourself from what that title does, and say plainly that you drafted them and
   they should delete whatever does not apply. Do NOT ask "what are your daily
   tasks", do NOT ask for an achievement, and do NOT chase a number — that is
   the interrogation that makes people abandon this halfway.
3. PAST ROLES — same: title, employer, dates, then you draft the bullets. Fresh
   graduate? Ask the degree and any project or internship, then draft from those.
4. SKILLS — do not ask. WRITE 6-10 HARD skills/tools/systems that ATS scans for
   in THEIR title (accountant → IFRS, SAP/QuickBooks, reconciliations, Zakat/tax;
   engineer → stack/tools; radiographer → CT/MRI, PACS, radiation protection).
   No soft-skill fluff. The user prunes what they do not have.
5. EDUCATION & CERTS — degree, university, graduation year; certifications
   (CPA, CMA, PMP, AWS...) if they exist — ask, never assume.
6. IDENTITY — full name + phone or email for the header.
Once axes 1-3 have real content, SILENTLY compose the professional summary
(3 parts: title+years+specialization | 2-3 hard skills + one quantified
achievement | the value they offer an employer) and include it as
profile_patch.summary — you write it, you don't ask about it.

# FIELD DISCIPLINE — one shape, always
- role = the JOB TITLE ONLY ("Nurse", "محاسب"). Never a sentence, never a sector
  ("سياحة"), never a status ("خريج جديد"), never "Title, 5 years in X". Years go
  to years_of_experience (a number). Industry goes to industry.
- Use EXACTLY these keys: role, years_of_experience, industry, name, contact,
  summary, skills, education{degree,university,graduation_year}, certifications,
  experiences[{header{title,company,start_date,end_date},bullets[]}]. No variants.
- Never emit a field as "" to mean "unchanged" — omit it instead.
- start_date is when THAT JOB began; end_date is when it ended, or "Present" for
  the current one. ATS parsers read the RANGE — a role with no dates is a role
  they cannot place in time, so ask for them once and never leave them empty.
  A graduation year is not a start date. Format both as "Month YYYY" (or "YYYY"
  if that is all the user knows).

# NEVER PUT THESE IN A RESUME
National ID / Iqama number, IBAN or any bank detail, passport number, SSN,
salary, card numbers. If the user offers one, say briefly why it does not belong
on a resume and ask for a professional email or phone instead — in Arabic exactly
as firmly as in English. Marital status, religion, age and photos also stay out.

# THE ONE LAW — TRUTH
You NEVER invent facts. No companies, titles, degrees, dates, tools, metrics,
or achievements the user did not state or clearly approximate themselves.
- RICH input -> preserve EVERY number, currency, date, and proper noun exactly
  (40 مليون ريال -> "SAR 40M" or "40 million riyals" — never drop the currency;
  15 فرع -> "15 branches"; جائزتين -> "two awards").
- VAGUE input ("مبيعات وعملاء", "backend stuff") -> DO NOT pad with invented
  specifics. Either DEEPEN (ask one targeted follow-up) or write ONE modest
  truthful line from what exists ("Handled sales and client relationships").
- Bullets count = what the content supports: 1-4, never a forced 4.
- Placeholders like [add your number] are FORBIDDEN when the number exists in
  the input. Use them ONLY when a metric is genuinely missing AND the user
  already declined to provide it — max 1 per resume, phrased naturally in the
  target language ([أضف الرقم] / [add the figure]). NEVER in summary.
- DATES ARE HISTORY. A request to change a graduation year, a start date, or a
  tenure to something other than what happened is forgery — refuse it as plainly
  as you refuse an invented degree, and say so.

# YOU WRITE, THEY PRUNE — the core of this product
A vague answer is NOT a prompt to ask again. It is your cue to write.
"كاشير في بنده" is everything you need: you know what a supermarket cashier does.
Draft it properly — "Processed customer transactions and handled cash and card
payments at point of sale", "Maintained accurate till balances at shift close",
"Restocked shelves and monitored product expiry dates" — and tell them to delete
what does not apply. Never answer that input with "أخبرني المزيد عن مهامك".

ELEVATE their words, never merely echo them. "يحاسب العملاء" becomes
"Processed customer transactions accurately at point of sale", not
"Checks out customers". Their plain phrasing is the seed; the resume line is
professional register.

The ONE thing you may still ask about a duty is a number they alone can know,
and only when they volunteered a measurable achievement themselves. If they did
not raise it, do not go looking for it.

Say what you did, in one short clause: "كتبت لك مهام الكاشير المعتادة — احذف ما
لا ينطبق عليك" / "I've drafted the usual duties for this role — delete anything
that isn't you."
Tailor everything to THEIR role: accountant->audits/software (SAP, QuickBooks);
engineer->projects/stack; sales->quota/growth%; teacher->class size/outcomes;
fresh grad->projects/internship/GPA-if-strong. Saudi market awareness
(Jadarat/Taqat keywords, Saudization context) where natural.

# REPHRASING CRAFT
Action verb + scope + number (if it exists) + outcome. Weave in ATS keywords
from the job ad when present. English lines by default; Arabic lines use
correct professional terminology when the output language is Arabic.`;

interface Msg { role: "system" | "user" | "assistant"; content: string }

/**
 * Deterministic replies for the moments where a job-title question is the wrong
 * answer. These skip the model entirely: it is cheaper, and a live run showed the
 * model answers "كنت مسجون سنتين" with "ما هو مجال عملك؟" — the users who most
 * need this product are the ones it was losing.
 */
const SENSITIVE_REPLY: Record<string, { ar: string; en: string }> = {
  record: {
    ar: "شكراً على صراحتك. السيرة الذاتية لا تُلزمك بذكر ذلك — نكتب الفترة كتطوير مهني أو عمل حر إن كان لديك ما يُذكر فيها، ولا نختلق شيئاً. ما هي وظيفتك أو المجال الذي تستهدفه؟",
    en: "Thank you for trusting me with that. A resume does not require you to disclose it — we present the period as professional development or self-employment if there is anything real to show, and we invent nothing. What role or field are you targeting?",
  },
  health_gap: {
    ar: "أقدّر مشاركتك هذا. الفجوة لا تحتاج تفسيراً طبياً في السيرة — نذكر السنوات بلا تفصيل، والتركيز يكون على ما قبلها وما بعدها. ما آخر مسمى وظيفي لك؟",
    en: "I appreciate you sharing that. A gap needs no medical explanation on a resume — we show the years without detail and let what came before and after carry the weight. What was your most recent job title?",
  },
  disability: {
    ar: "سؤال مهم: لا يُطلب منك ذكر الإعاقة في السيرة الذاتية، والقرار قرارك وحدك. برنامج «توافق» في السعودية يمنح المنشآت حوافز لتوظيف الأشخاص ذوي الإعاقة، فبعض المتقدمين يفضّل ذكرها لهذا السبب. ما مجال عملك المستهدف؟",
    en: "Fair question: you are not required to disclose a disability on a resume, and the choice is entirely yours. Some applicants do choose to, since employers in Saudi receive support through the Tawafuq programme for hiring people with disabilities. What field are you targeting?",
  },
  gap: {
    ar: "الانقطاع عن العمل شائع أكثر مما تتصور، ولا يُخفى بل يُؤطَّر. سنبني سيرة تُبرز خبرتك السابقة أولاً. ما هي وظيفتك الأخيرة أو المجال الذي تريد العودة إليه؟",
    en: "Career breaks are far more common than they feel, and the answer is framing, not hiding. We will lead with your prior experience. What was your last role, or the field you want to return to?",
  },
  layoff: {
    ar: "التسريح لا يُذكر في السيرة الذاتية إطلاقاً — السيرة تسجّل ما أنجزته، لا كيف انتهت الوظيفة. ما آخر مسمى وظيفي لك وكم سنة خبرة فيه؟",
    en: "A layoff never appears on a resume — a resume records what you achieved, not how the job ended. What was your most recent job title, and how many years of experience do you have in it?",
  },
  age: {
    ar: "خبرتك الطويلة ورقة قوة إن عُرضت صح: نُبرز آخر ١٠–١٥ سنة بأرقام، ولا نذكر العمر ولا تواريخ التخرج القديمة. ما مجالك أو وظيفتك الأخيرة؟",
    en: "Long experience is leverage when it is presented right: we foreground the last 10–15 years with numbers, and leave out your age and older graduation dates entirely. What is your field or most recent role?",
  },
  hope: {
    ar: "ثلاث سنوات بحث مرهقة فعلاً، وكونك هنا الآن يعني أنك لم تتوقف. سيرة أقوى تغيّر معدل الردود، وهذا ما نقدر عليه اليوم. ما آخر وظيفة عملت بها؟",
    en: "Three years of searching is exhausting, and the fact that you are here means you have not stopped. A stronger resume changes your response rate, and that is what we can fix today. What was the last job you held?",
  },
};

const MINOR_REPLY = {
  under15: {
    ar: "أقدّر حماسك للعمل. نظام العمل السعودي يحدد سن العمل بـ١٥ سنة، فلا يمكنني بناء سيرة ذاتية لوظيفة بدوام كامل في عمرك الآن. لكن ما ينفعك فعلاً: دورات مجانية (منصة دروب)، تطوّع مدرسي، ومشاريع شخصية توثّقها من الآن — هذي تصير أول سيرة قوية لك بعد سنتين.",
    en: "I appreciate the drive. Saudi labour law sets the minimum working age at 15, so I cannot build a full-time job resume for you yet. What does help right now: free courses (Doroob), school volunteering, and personal projects you document as you go — that becomes a genuinely strong first resume in a couple of years.",
  },
  teen: {
    ar: "أهلاً بك. في عمرك، العمل مسموح بضوابط: بدوام جزئي، بموافقة ولي الأمر، وبدون ساعات ليلية أو أعمال خطرة. فلنبنِ سيرة مناسبة لعمل جزئي أو تدريب صيفي — ما المهارات أو المشاريع أو التطوع الذي لديك؟",
    en: "Welcome. At your age work is allowed with conditions: part-time, with guardian consent, and no night or hazardous work. Let's build a resume aimed at part-time or a summer placement — what skills, projects, or volunteering do you have?",
  },
};

/**
 * The turn, on Claude, with the contract enforced as a JSON schema. Returns the
 * parsed object directly — there is nothing to extract and nothing to guess.
 *
 * Thinking is left ON (the Opus 5 default) and held down with effort instead:
 * disabling it is the documented cause of internal tags leaking into the visible
 * response, and `say` is shown to the user verbatim.
 */
async function callAnthropicTurn(system: string, user: string): Promise<Record<string, unknown> | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no-key");
  const client = new Anthropic({ apiKey: key, timeout: 25000, maxRetries: 1 });
  const t0 = Date.now();
  const res = await client.messages.create({
    model: modelFor("anthropic"),
    max_tokens: 8000,
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema: TURN_SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try { return JSON.parse(text.text); } catch { return null; }
}

/**
 * Draft a role, with live web search available. The search tool is declared on
 * every call and the model decides when a lookup helps — a forced search per
 * request would spend money and seconds on titles it already knows cold.
 *
 * Server tools run their own loop and can stop with `pause_turn` before the
 * answer exists; resuming is required, or a searched draft silently comes back
 * truncated.
 */
async function callAnthropicDraft(user: string): Promise<Record<string, unknown> | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no-key");
  const client = new Anthropic({ apiKey: key, timeout: 50000, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  const t0 = Date.now();

  for (let hop = 0; hop < 4; hop++) {
    const res = await client.messages.create({
      model: modelFor("anthropic"),
      max_tokens: 8000,
      system: `${DRAFT_PROMPT}\n\n# TODAY\n${todayContext()}`,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      output_config: { effort: "low", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      messages,
    });
    logUsage({ route: "interview", op: "draft", provider: "anthropic", model: res.model, ...fromAnthropic(res), ms: Date.now() - t0 });
    if (res.stop_reason === "refusal") return null;
    if (res.stop_reason === "pause_turn") {
      // The server-tool loop hit its iteration cap — hand the turn back to resume.
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    try { return JSON.parse(text.text); } catch { return null; }
  }
  return null;
}

/**
 * @param json ask the endpoint to constrain the reply to a JSON object. Every
 *   "busy" 502 this route has ever returned was extractJson failing on prose the
 *   model wrapped around its JSON — three of them in a 100-scenario run. JSON
 *   mode removes the cause rather than retrying past it. If the deployment does
 *   not accept response_format the first attempt fails and the retry drops the
 *   parameter, so support is discovered instead of assumed.
 */
/**
 * Draft a role's duties and skills. The single entry point: the draft endpoint
 * and the turn's guaranteed backfill both come through here, so which provider
 * runs it, and what a draft is allowed to contain, are decided in one place.
 */
async function draftRole(opts: {
  role: string; years: number | null; industry: string; jobAd: string; langWord: string;
}): Promise<Record<string, unknown> | null> {
  const msg = `JOB TITLE: ${opts.role}
${opts.years ? `YEARS OF EXPERIENCE: ${opts.years} (pitch the seniority of the duties to this)` : ""}
${opts.industry ? `INDUSTRY: ${opts.industry}` : ""}
${opts.jobAd ? `TARGET JOB AD — mirror its vocabulary where it genuinely applies:\n${opts.jobAd}` : ""}
OUTPUT LANGUAGE: ${opts.langWord}.

Draft the duties and skills for this title.`;

  if (PROVIDER === "anthropic") return callAnthropicDraft(msg);
  const raw = await callLLM([
    { role: "system", content: `${DRAFT_PROMPT}\n\n# TODAY\n${todayContext()}` },
    { role: "user", content: `${msg}\n\nRespond with STRICT JSON ONLY: {"duties":["..."],"skills":["..."]}` },
  ], 900, true, "draft");
  return raw ? extractJson(raw) : null;
}

async function callLLM(messages: Msg[], maxTokens: number, json = false, op = "turn"): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("no-key");
  const model = modelFor("nvidia");
  let out = "";
  const t0 = Date.now();
  // One silent retry — the live interview must survive a transient upstream blip.
  for (let attempt = 0; attempt < 2 && !out; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model, temperature: 0.4, top_p: 0.9, max_tokens: maxTokens, messages,
          // Only on the first attempt: the retry is also the fallback for an
          // endpoint that rejects the parameter outright.
          ...(json && attempt === 0 ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        out = String(data?.choices?.[0]?.message?.content || "").trim();
        const u = fromOpenAI(data);
        logUsage({ route: "interview", op, provider: "nvidia", model, ...u, ms: Date.now() - t0 });
      } else {
        console.error(`Interview upstream ${res.status} (attempt ${attempt + 1})`);
      }
    } catch (e) {
      console.error(`Interview error (attempt ${attempt + 1}):`, e instanceof Error ? e.message : e);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/** Pull the first balanced JSON object out of a model reply (handles code fences). */
function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

/**
 * Honesty guard (the automated truth check, applied at runtime, not just CI):
 * when the user's own words already contain digits, a bracketed [add …]
 * placeholder in the output is spurious (bug R2/R3) — strip it. Also cap
 * placeholders to at most one per response.
 *
 * The leading "- " is PROTOCOL, not decoration: the clients use its presence to
 * tell a job-header line from an achievement bullet (Journey.tsx, ResumeTemplate
 * strips it again before rendering). So normalize the marker to exactly one
 * "- " when there is one, and never add or remove one.
 */
function guardLines(lines: string[], sourceText: string): string[] {
  const budget = { left: 1 };
  const digits = hasDigits(sourceText);
  return lines
    .map((l) => {
      const t = l.trim();
      const marked = /^[-•*]/.test(t);
      const body = stripPlaceholders(t.replace(/^(?:[-•*]\s*)+/, ""), digits, budget);
      return body && marked ? `- ${body}` : body;
    })
    .filter((l) => l.replace(/^-\s*/, "").length > 2);
}

/**
 * Reject cross-origin POSTs. This is not authentication — a script can omit the
 * header — but it stops the endpoint from being driven by another site's page,
 * and it costs one comparison.
 */
function crossOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host");
  try { return new URL(origin).host !== host; } catch { return true; }
}

export async function POST(req: NextRequest) {
  try {
    if (crossOrigin(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    // Two windows: a burst cap so a loop cannot fire 30 calls in 4 seconds, and
    // the standing budget. Both are best-effort per instance (see ratelimit.ts) —
    // a shared store is required before this is a hard guarantee.
    const ip = clientIp(req);
    if (!(await allowShared(`interview:burst:${ip}`, 6, 20 * 1000)) ||
        !(await allowShared(`interview:${ip}`, 60, 10 * 60 * 1000))) {
      return NextResponse.json({ error: "Slow down a little — try again in a minute." }, { status: 429 });
    }

    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Message too long." }, { status: 413 });
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Message too long." }, { status: 413 });
    }

    let body;
    try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    const action = body?.action === "turn" ? "turn"
      : body?.action === "gaps" ? "gaps"
      : body?.action === "draft" ? "draft"
      : "rephrase";
    const outputLang = body?.lang === "ar" ? "ar" : body?.lang === "both" ? "both" : "en";
    const langWord = outputLang === "ar" ? "Arabic (فصحى professional)" : outputLang === "both" ? "English, then an Arabic version" : "English";
    const uiAr = outputLang !== "en";
    const targetRole = String(body?.targetRole || body?.profile?.role || "").slice(0, 120);
    const text = String(body?.text || body?.answer || "").slice(0, 1500);
    const stateSummary = String(body?.stateSummary || "").slice(0, 2500);

    const providerKey = PROVIDER === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.NVIDIA_API_KEY;
    if (!providerKey) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

    // The model has no clock; without this it reads a past year as the future.
    const systemPrompt = `${SYSTEM_PROMPT}\n\n# TODAY\n${todayContext()}`;

    /* ── action="draft" — write the role's duties and skills so the user edits ── */
    if (action === "draft") {
      // Drafting itself needs no web search — a model that knows what a cashier
      // does can write the duties. Only the live-market lookup is Anthropic-only,
      // so NVIDIA drafts from its own knowledge rather than answering 501.
      if (!targetRole) return NextResponse.json({ error: "A job title is required." }, { status: 400 });


      let d: Record<string, unknown> | null;
      try {
        d = await draftRole({
          role: targetRole,
          years: Number(body?.profile?.years_of_experience ?? body?.years) || null,
          industry: String(body?.profile?.industry || body?.industry || "").slice(0, 80),
          jobAd: String(body?.jobAd || "").slice(0, 3000),
          langWord,
        });
      } catch (e) { console.error("Interview draft error:", e instanceof Error ? e.message : e); d = null; }
      if (!d) return NextResponse.json({ error: "busy" }, { status: 502 });

      // Same guards as everywhere else: a drafted line is still a line that can
      // reach the PDF, so placeholders and PII do not get a pass for being ours.
      const budget = { left: 0 };
      const clean = (v: unknown, cap: number): string[] =>
        (Array.isArray(v) ? v : []).map(String)
          .map((s) => stripPlaceholders(s.replace(/^[-•*]\s*/, "").trim(), true, budget))
          .filter((s) => s.length > 2).slice(0, cap);

      const piiHits: string[] = [];
      const payload = scrubDeep({
        duties: clean(d.duties, 8),
        skills: clean(d.skills, 10),
        note: typeof d.note === "string" ? d.note.slice(0, 240) : "",
      }, piiHits);
      if (piiHits.length) console.warn("interview/draft: scrubbed PII", [...new Set(piiHits)].join(","));
      if (!payload.duties.length && !payload.skills.length) {
        return NextResponse.json({ error: "busy" }, { status: 502 });
      }
      return NextResponse.json(payload);
    }

    /* ── action="turn" — the full conversation brain ── */
    if (action === "turn") {
      const history: Array<{ who?: string; role?: string; text?: string; content?: string }> =
        Array.isArray(body?.history) ? body.history.slice(-12) : [];
      const profile = body?.profile && typeof body.profile === "object" ? body.profile : {};

      /* Answer the human before spending a model call on the next form field. */
      const age = statedAge(text);
      if (age !== null && age < 18) {
        const r = age < 15 ? MINOR_REPLY.under15 : MINOR_REPLY.teen;
        return NextResponse.json({
          axis: 1,
          action: age < 15 ? "SUGGEST" : "ASK",
          say: uiAr ? r.ar : r.en,
          profile_patch: {},
          resume_lines: [],
          chips: [],
          progress: computeProgress(profile),
        });
      }
      const topic = sensitiveTopic(text);
      if (topic) {
        const canned = SENSITIVE_REPLY[topic];
        const say = uiAr ? canned.ar : canned.en;
        // Say it once, not on every turn that mentions the same word.
        if (!isRepeat(say, history)) {
          return NextResponse.json({
            axis: 1,
            action: "SUGGEST",
            say,
            profile_patch: {},
            resume_lines: [],
            chips: [],
            progress: computeProgress(profile),
          });
        }
      }

      const userMsg = `OUTPUT LANGUAGE for resume_lines: ${langWord}.
CURRENT PROFILE (JSON): ${JSON.stringify(profile).slice(0, 2600)}
RECENT CONVERSATION: ${history.map((h) => `${h.who || h.role}: ${h.text || h.content}`).join("\n").slice(0, 1500)}
THE USER JUST SAID: "${text || "(start the interview)"}"

Run ANALYZE -> DECIDE (ASK|DEEPEN|REPHRASE|SUGGEST|FINISH) -> ACT, following THE ATS MAP:
- Identify the current axis (1 ROLE&YEARS | 2 CURRENT ROLE | 3 PAST ROLES | 4 SKILLS | 5 EDUCATION&CERTS | 6 IDENTITY), capture the user's facts into it, then either DEEPEN it once or ADVANCE to the next incomplete axis.
- The CURRENT PROFILE is the WHOLE memory you have: it already holds role, years_of_experience, industry, experiences, wovenLines (the resume lines written so far) and summary. A fact that is in there has ALREADY been answered — never ask for it again. NEVER restate, reword, or recap a line that already exists.
- Read RECENT CONVERSATION before you write "say": if you already asked something there, do not ask it again in any wording.
- A JOB TITLE ALONE is enough to draft. "كاشير في سوبرماركت" needs no employer
  and no dates before you write — draft that role's bullets into
  experiences[].bullets in the SAME turn, then ask for the employer and dates.
  Do not wait to be asked and do not ask permission — drafting is the product.
- resume_lines = ONLY brand-new EXPERIENCE-section lines for facts the user JUST
  provided OR duties you just drafted for a role they just named. A job-header line carries NO leading dash; every achievement bullet starts with "- " — the client uses that difference to lay the section out, so it matters. Education, skills, summary, name, contact travel ONLY inside profile_patch — NEVER in resume_lines. At FINISH, resume_lines must be [] unless a genuinely new fact just arrived.
- Experience entries also go to profile_patch.experiences:[{header:{title,company,start_date,end_date},bullets[]}] so the client can lay them out; when refining an EXISTING entry, re-emit that whole entry (the client replaces it).
- Emit profile_patch.summary once axes 1-3 have content (rewrite it silently as facts grow — preserving stated years EXACTLY: ٦ سنوات stays ٦, never becomes ٤). The summary is finished prose that gets printed: it may NEVER contain a [bracketed placeholder].
- FINISH only when role + summary + at least one quantified experience + skills + education + name + contact ALL exist — and you MUST have emitted profile_patch.summary by then (compose it from real facts; if the material is incomplete, ASK for the missing piece instead of finishing). When you FINISH, "say" is a warm one-line farewell announcing the build — never a question.

Respond with STRICT JSON ONLY, exactly this shape:
{"think":"1-2 sentence private analysis","axis":2,"action":"ASK|DEEPEN|REPHRASE|SUGGEST|FINISH","say":"acknowledge in one clause, then <=40 words, one question max, aimed at the NEXT missing axis","profile_patch":{only changed fields},"resume_lines":["..."],"chips":[{"label":"...","patch":{}}]}
Honor THE ONE LAW: preserve every number/currency/proper-noun the user gave; never invent; never rewrite a date to something that did not happen; bullets 1-4 as content supports; no placeholder when the number exists. One question per message, max 10 questions, one DEEPEN per axis.`;

      let j: Record<string, unknown> | null;
      if (PROVIDER === "anthropic") {
        // Schema-constrained: malformed JSON is not a failure mode here.
        try { j = await callAnthropicTurn(systemPrompt, userMsg); }
        catch (e) { console.error("Interview anthropic error:", e instanceof Error ? e.message : e); j = null; }
      } else {
        const raw = await callLLM([{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }], 700, true, "turn");
        j = raw ? extractJson(raw) : null;
      }
      if (!j) return NextResponse.json({ error: "busy" }, { status: 502 });

      const resumeLines = Array.isArray(j.resume_lines)
        ? scrubDeep(guardLines((j.resume_lines as string[]).map(String), text))
        : [];

      // The patch is normalized to one schema, stripped of placeholders, frozen
      // against date rewrites, then scrubbed of anything that must not be printed.
      const norm = normalizePatch(
        (j.profile_patch && typeof j.profile_patch === "object" ? j.profile_patch : {}) as Record<string, unknown>,
        { sourceText: text, existing: profile as Record<string, unknown> },
      );
      const piiHits: string[] = [];
      const patch = scrubDeep(norm.patch, piiHits);
      if (norm.dropped.length) console.warn("interview: dropped fields", norm.dropped.join(","));
      if (piiHits.length) console.warn("interview: scrubbed PII", [...new Set(piiHits)].join(","));

      /*
       * Drafting is guaranteed here, not requested in the prompt. The live run
       * showed the model capturing role:"كاشير" and then returning bullets:[] —
       * an instruction it is free to skip is an instruction that gets skipped,
       * which is the same lesson as the honesty guards. So: the moment a title
       * is known and that role still has no bullets, the route drafts them.
       * One extra model call, only on the turn where a role first appears.
       */
      const knownRole = String(patch.role || (profile as Record<string, unknown>).role || "");
      const alreadyDrafted = Boolean((profile as Record<string, unknown>).drafted_for) &&
        (profile as Record<string, unknown>).drafted_for === knownRole;
      const patchExps = Array.isArray(patch.experiences) ? patch.experiences as Array<Record<string, unknown>> : [];
      const hasBullets = patchExps.some((e) => Array.isArray(e.bullets) && e.bullets.length > 0);

      let draftedSkills = "";
      if (knownRole && !alreadyDrafted && !hasBullets && !resumeLines.length) {
        try {
          const d = await draftRole({
            role: knownRole,
            years: Number(patch.years_of_experience ?? (profile as Record<string, unknown>).years_of_experience) || null,
            industry: String(patch.industry || (profile as Record<string, unknown>).industry || ""),
            jobAd: String((profile as Record<string, unknown>).jobAd || ""),
            langWord,
          });
          if (d) {
            const budget = { left: 0 };
            const duties = (Array.isArray(d.duties) ? d.duties : []).map(String)
              .map((x) => stripPlaceholders(x.replace(/^[-•*]\s*/, "").trim(), true, budget))
              .filter((x) => x.length > 2).slice(0, 6);
            const skills = (Array.isArray(d.skills) ? d.skills : []).map(String)
              .map((x) => x.trim()).filter(Boolean).slice(0, 10);
            if (duties.length) {
              // Attach to the role's entry so the client lays it out, and mirror
              // into resume_lines so the live preview fills in immediately.
              const head = patchExps[0]?.header && typeof patchExps[0].header === "object"
                ? patchExps[0].header as Record<string, unknown>
                : { title: knownRole, company: "", start_date: "", end_date: "" };
              patch.experiences = [{ header: head, bullets: duties }];
              resumeLines.push(...duties.map((x) => `- ${x}`));
            }
            if (skills.length && !patch.skills) draftedSkills = skills.join("، ");
            if (draftedSkills) patch.skills = draftedSkills;
            // Remember what we drafted for, so the next turn does not redraft.
            patch.drafted_for = knownRole;
          }
        } catch (e) {
          // A failed draft must not fail the turn — the conversation continues.
          console.error("interview: draft backfill failed:", e instanceof Error ? e.message : e);
        }
      }

      // Progress and FINISH are decided from the merged profile, not from the
      // model's self-report (which was 0 or 17 and nothing else in the live run).
      const merged = { ...(profile as Record<string, unknown>), ...patch } as Record<string, unknown>;
      if (resumeLines.length) {
        merged.wovenLines = [...(Array.isArray(profile.wovenLines) ? profile.wovenLines : []), ...resumeLines];
      }
      const gated = gateFinish(
        ["ASK", "DEEPEN", "REPHRASE", "SUGGEST", "FINISH"].includes(String(j.action)) ? String(j.action) : "ASK",
        merged,
      );

      let say = String(j.say || "").trim();
      if (norm.roleNeedsTitle) {
        // "سياحة" / "خريج جديد" would head the resume as if it were a job title.
        // Keep what they said, but get the real one before the CV is built.
        say = uiAr
          ? `«${patch.role}» مجال وليس مسمى وظيفي — والمسمى هو ما تقرأه أنظمة الفرز أولاً. ما المسمى الدقيق (مثلاً: منسّق برامج سياحية، مسؤول حجوزات)؟`
          : `"${patch.role}" is a field rather than a job title, and the title is the first thing an ATS reads. What is the exact title (e.g. Tourism Programme Coordinator, Reservations Officer)?`;
      } else if (gated.blocked) {
        // The model tried to finish an incomplete resume; do not announce a build.
        say = uiAr
          ? "قبل أن نُخرج السيرة، ناقصنا تفاصيل بسيطة — نكملها بسرعة؟"
          : "Before I build it, a couple of details are still missing — shall we finish them?";
      } else if (say && isRepeat(say, history)) {
        // Verbatim repetition was the single loudest failure in the live run.
        say = uiAr
          ? "لننتقل لمحور آخر: ما أهم مهارتين أو نظامين تستخدمهما في عملك؟"
          : "Let's move to another area: which two tools or systems do you use most in your work?";
      } else if (!say) {
        say = gated.action === "FINISH"
          ? (uiAr ? "تمام — سيرتك اكتملت. أبنيها الآن وأحسب درجتك…" : "Done — your resume is complete. Building it and scoring it now…")
          : (uiAr ? "أخبرني المزيد عن دورك ومهامك اليومية." : "Tell me more about your role and daily tasks.");
      }

      return NextResponse.json({
        // NOTE: "think" is the model's private reasoning and is deliberately NOT
        // returned — it was readable in the browser's Network tab.
        axis: Math.max(1, Math.min(6, Number(j.axis) || 1)),
        action: gated.action,
        say: scrubDeep(say),
        profile_patch: patch,
        resume_lines: resumeLines,
        chips: Array.isArray(j.chips) ? scrubDeep(j.chips.slice(0, 4)) : [],
        progress: computeProgress(merged),
      });
    }

    /* ── action="gaps" — honest follow-up questions ── */
    if (action === "gaps") {
      const userMsg = `List up to 4 SHORT gap questions that would genuinely strengthen this CV IF the candidate has a real answer (a certification, a concrete number, a language, a tool). Never assume they have these — ask.
Language: ${outputLang === "ar" ? "professional Modern Standard Arabic" : "professional English"}.
One per line, format exactly: question | field   (field ∈ extras, skills, duties, education).
Target role: ${targetRole || "not given"}
${stateSummary}
Output ONLY the lines.`;
      const raw = await callLLM([{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }], 400, false, "gaps");
      if (!raw) return NextResponse.json({ error: "busy" }, { status: 502 });
      const gaps = raw.split("\n").map((l) => l.trim().replace(/^[-•*]\s*/, "")).filter((l) => l.includes("|"))
        .map((l) => { const [q = "", f = ""] = l.split("|").map((p) => p.trim()); const field = ["extras", "skills", "duties", "education"].includes(f) ? f : "extras"; return { q, field }; })
        .filter((g) => g.q.length > 3).slice(0, 4);
      return NextResponse.json({ gaps: scrubDeep(gaps) });
    }

    /* ── action="rephrase" — legacy UI mode, new truth rules ── */
    if (!text.trim()) return NextResponse.json({ error: "Nothing to rephrase." }, { status: 400 });
    const userMsg = `Rewrite the candidate's casual description into professional CV bullet lines under THE ONE LAW.
OUTPUT LANGUAGE: ${langWord}. Target role: ${targetRole || "not given"}.
Rules recap: each line starts "- "; preserve EVERY number/currency/proper-noun exactly; do NOT invent specifics; write only as many bullets (1-4) as the content truly supports; NO [placeholder] when a number already exists.

Examples:
input: "مبيعات وعملاء" (role: مندوب مبيعات) -> {"lines":["- Managed day-to-day sales activities and client relationships."]}
input: "أسوي تقارير لـ15 فرع وفزت بجائزتين" -> {"lines":["- Prepared recurring financial reports covering 15 branches with full accuracy and on-time delivery.","- Earned two company awards recognizing outstanding performance."]}

CANDIDATE'S OWN WORDS:
${text}

Respond with STRICT JSON ONLY: {"lines":["- ...", "..."]}`;
    const raw = await callLLM([{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }], 500, false, "rephrase");
    if (!raw) return NextResponse.json({ error: "busy" }, { status: 502 });
    const j = extractJson(raw);
    let lines: string[] = [];
    if (j && Array.isArray(j.lines)) lines = (j.lines as string[]).map(String);
    else lines = raw.split("\n").map((l) => l.trim()).filter((l) => /^[-•*]/.test(l)); // tolerant fallback
    lines = scrubDeep(guardLines(lines, text).slice(0, 4));
    if (!lines.length) return NextResponse.json({ error: "busy" }, { status: 502 });
    return NextResponse.json({ lines });
  } catch {
    return NextResponse.json({ error: "busy" }, { status: 502 });
  }
}
