# Which variable goes where

Written because the same question came back four times, and each time the answer was
one line buried in a longer reply. This is the reference: what to paste, in which
project, and what happens if you paste it in the wrong place.

## The two things that are not the same store

A key pasted into **GitHub → Settings → Secrets** is readable only inside a GitHub
Actions run. Nothing in the running site can see it. That is where the model bench in
`.github/workflows/` gets its key, and that is all it is for.

A key pasted into **Vercel → Project → Settings → Environment Variables** is what the
deployed site reads at request time. `/api/suggest`, `/api/optimize` and
`/api/interview` only ever see this one.

They are separate stores with no connection between them. Putting the key in one does
not put it in the other, and a suggestion failing in production is never fixed by
touching GitHub.

## Two things Vercel does that look like one thing

**Redeploy** rebuilds the *same commit* it was pointed at. It picks up new environment
variables and no new code. This is the trap: a variable that a newer commit added is
still unread after a Redeploy, because the code that reads it is not in the build.

**A push to `main`** builds the newest commit. New code and new variables both.

So: variable changed → Redeploy is enough. Code changed → the build must come from the
newer commit. If a variable was added by the same commit as the code that reads it,
Redeploying the old deployment does nothing at all, and looks exactly like the variable
being ignored.

## One repository must not feed two projects

A Vercel project is one repository plus one set of environment variables plus its
domains. Connect a second project to the same repository and every push builds twice,
in two places, and the two builds do not share variables — so a key pasted in one is
absent in the other and the site that has the custom domain may be the one missing it.

`cv.rabit.sa` belongs to the project **`resume-ai`**. That is the one that matters.
Any other project built from this repository should have its Git connection removed
(Settings → Git → Disconnect) or be deleted; a disconnected project keeps its old
deployments and simply stops rebuilding.

## The AI switchboard

Two independent brains, because they are not the same kind of call. A suggestion is one
field, one sentence, and a person waiting with a cursor in an input. An ATS review is a
whole document and a progress bar that has permission to take a minute. Measured on 111
job titles, the model that is right for the second is unusable behind the first.

| Variable | Read by | Default if unset |
|---|---|---|
| `AI_PROVIDER_SUGGEST` | `/api/suggest` only | falls back to `AI_PROVIDER` |
| `AI_PROVIDER` | `/api/optimize`, `/api/interview`, and `/api/suggest` if the above is unset | `nvidia` |
| `ANTHROPIC_API_KEY` | any route running on `anthropic` | — |
| `NVIDIA_API_KEY` | any route running on `nvidia` | — |
| `ANTHROPIC_MODEL_SUGGEST` | `/api/suggest` on Anthropic | `claude-haiku-4-5` |
| `ANTHROPIC_MODEL` | `/api/interview` on Anthropic | `claude-opus-5` |
| `NVIDIA_MODEL` | either route on NVIDIA | `meta/llama-4-maverick-17b-128e-instruct` |
| `AI_MODEL` | both, as a last resort | per provider |

`/api/suggest` deliberately does **not** inherit `ANTHROPIC_MODEL`. Setting that
variable is how you choose the interview brain, and inheriting it would silently put
Opus behind a form field that fires on every tap — which the bench measured at a 19-second
median and a 43% hang rate. A form field cannot use that model, so it never picks it up
by accident.

### To run suggestions on Claude and leave the review where it is

In project `resume-ai`, Production:

```
AI_PROVIDER_SUGGEST = anthropic
ANTHROPIC_API_KEY   = sk-ant-…
```

Do **not** set `AI_PROVIDER`. Setting it moves `/api/optimize` and `/api/interview` to
Anthropic as well, which is a paid call on the longest, most expensive request in the
product — and the free model already scores the same on that job.

The fail-safe is real and worth knowing: `ANTHROPIC_API_KEY` on its own changes nothing.
Without a provider switch, every route stays on NVIDIA and the key sits unused. A pasted
key is never enough by itself, in either direction.

### Verifying it actually took

Vercel → project → Logs, make one suggestion in the builder, and read the line for
`POST /api/suggest`. It reports the provider and model it used. `provider: "nvidia"` after
setting the variable means the build predates the code — see the Redeploy note above.

Or, if `HEALTH_TOKEN` is set, `GET /api/health/ai` with that token in the
`x-health-token` header returns both providers, both models, and whether each key is
present. Without `HEALTH_TOKEN` the endpoint answers 404 to everyone, deliberately: an
unauthenticated health page is a map of which keys you are missing.

## The rest, by group

Not every variable here changes behaviour a user can see; these are grouped rather than
documented one by one, because each is read in exactly one place and the code says what
it does.

- **Rate limiting** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Unset means
  the limiter counts in memory per instance, so the limit is real but the remaining count
  is not shared. Fine for now; not something to build UX on.
- **Payment** — `PAYLINK_API_ID`, `PAYLINK_SECRET_KEY`, `PAYLINK_BASE_URL`,
  `NEXT_PUBLIC_PAY_MODE`, `PAY_CURRENCY`, `PRICE_SINGLE`, `PRICE_COMPLETE`,
  `PRICE_MONTHLY`.
- **Email** — `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `EMAIL_FROM`.
- **Voice** — `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `ELEVENLABS_KEY`,
  `ELEVENLABS_VOICE_F`, `ELEVENLABS_VOICE_M`, `GEMINI_TTS_KEY`, `GEMINI_TTS_MODEL`.
- **Analytics** — `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`,
  `NEXT_PUBLIC_GOOGLE_ADS_CONV_LABEL`.
- **Site** — `NEXT_PUBLIC_APP_URL` (defaults to `https://cv.rabit.sa`),
  `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_BUILDER_DEFAULT`.
- **Secrets for admin paths** — `ADMIN_SECRET`, `ACCESS_SECRET`, `HEALTH_TOKEN`.

`NEXT_PUBLIC_SUPPORT_EMAIL` is worth setting rather than leaving: unset, the contact
address shown to visitors is the owner's personal one.

## The daily deployment limit, and how it kept being spent

Hobby allows **100 deployments per rolling 24 hours**, counted per deployment created —
not per push, not per successful build. Hit it and every deploy returns:

```
HTTP 402 {"error":{"code":"payment_required",
  "message":"Resource is limited - try again in 24 hours (more than 100,
             code: \"api-deployments-free-per-day\")",
  "limit":{"total":100,"remaining":0,"reset":<epoch ms>}}}
```

The `reset` field is the exact moment it clears. It is a rolling window from when the
limit was hit, not midnight.

**Why it was reached twice in one day.** The working pattern was: push to the feature
branch, then merge and push to `main`. Vercel builds *both* — a preview for the branch and
production for main — so every commit cost two of the hundred. Add a few empty commits
pushed to force a rebuild and the budget goes quickly.

`vercel.json` now sets `git.deploymentEnabled` false for the feature branch, so a commit
costs one deployment instead of two. The branch is still pushed and still reviewable on
GitHub; it simply no longer builds a preview nobody opens.

**When it is already spent**, there are three ways out and only one is instant:

1. **Promote an existing READY deployment** in the Vercel dashboard (Deployments → ⋯ →
   Promote to Production). This reuses a build that already exists, so it does not create a
   new deployment and is not refused by the limit. It is the only same-day option.
2. **Wait for `reset`.** The push to `main` is already there; nothing needs re-pushing.
   Trigger `.github/workflows/deploy-now.yml` afterwards, or push any commit.
3. **Pro**, which removes the cap.

The `deploy-now` workflow is worth keeping for exactly the reason it was written: a push
that produces no build is silent, and this prints Vercel's own JSON so a refusal explains
itself instead of looking like a slow deploy.
