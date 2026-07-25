# Benching the model

Two questions, two suites, one workflow. Both live in `.github/workflows/model-bench.yml` and
both are dispatch-only.

## Why it runs in GitHub Actions and not locally

Because that is the only place the key exists. GitHub never hands an Actions secret to anything
outside a workflow run — not to the API, not to a checkout, not to a development sandbox. So
"use the NVIDIA key from the repository secrets" necessarily means "run in Actions".

The development sandbox also has no network egress to `integrate.api.nvidia.com`. Running the
bench there returns, for every title:

    http-403: Host not in allowlist: integrate.api.nvidia.com

which is worth recognising: it is the sandbox's egress policy, not a bad key and not a bug in
the script.

## The two suites

    suite = models     Which model should this product run on?
                       Three hard cases per candidate — including the one most of this market
                       actually is: an Arabic job title with an English CV requested. 3 calls
                       per model. Use `list_only` to print the NVIDIA catalogue and spend
                       nothing.

    suite = titles     How good is the CHOSEN model across the whole catalogue?
                       All 111 occupations the product publishes a page for — 61 Arabic, 50
                       English — one call each. Inputs: `lang` (both/ar/en) and `limit`
                       (0 = all; anything else samples that many, spread across categories
                       rather than taking the first N, which would all be Technology).

## Comparing providers

`suite=titles` takes a `provider` input — `nvidia` (default) or `anthropic`. Both sides get the
**same** system prompt, the **same** user message and the **same** scoring, because the question
is which one drafts a Saudi CV better, not which one is easier to prompt. The only differences
are the ones the APIs force: NVIDIA takes `response_format: json_object` plus a shape sentence
appended to the user turn, Anthropic takes `DRAFT_SCHEMA` as a real JSON schema.

`anthropic` needs `ANTHROPIC_API_KEY` as a repository secret. The workflow checks for it up
front and says which key is missing rather than reporting a generic failure — with two
providers, "no key reached the runner" is the wrong message when one of them is set.

One caveat worth stating: the product's Anthropic drafting path offers the model **web search**,
and the bench does not. So an Anthropic run here understates what the product would produce.
Search costs seconds and money per title, and the comparison being made is drafting quality
from a bare job title, which is what the NVIDIA side gets too. Turning it on across 111 titles
is a separate question.

## It measures the model, not the product

The bench calls the provider directly, so nothing it reports has passed through
`filterFresh`, `cleanItems`, `scrubSuggestion` or `stripPlaceholders` — the four things the
route applies before any suggestion is displayed.

Two of the numbers therefore overstate the user-visible problem, and reading them the wrong way
is a mistake already made once with this file's own output:

- **`distinct`** is largely absorbed. `filterFresh` already compares incoming suggestions
  against each other with `saysTheSame`. A low rate means the model wastes lines; the symptom
  users get is being offered six suggestions after asking for eight, not seeing repeats.
- **`no-numbers`** is absorbed too — the route strips figures. A hit means "this line would
  have been rewritten", not "a fabricated number reached a CV".

`json`, `language` and the timeouts are **not** absorbed and do reach the user: a hang is a
dead end, unparseable JSON renders an empty section, and a CV in the wrong language ships.

## What the titles suite scores

Every check is the product's own rule, run through the product's own helper. `hasMetric`,
`extractJsonValue`, `DRAFT_PROMPT` and `draftUserMessage` are **imported** from `app/lib/`, not
copied, so the bench cannot drift from the route it is measuring.

| check | why it is a check |
|---|---|
| `json` | The route parses strict JSON. A model that answers in prose renders an empty section. |
| `duties` | 6–10. Fewer is not a draft; the route caps at ten. |
| `skills` | 6 or more, because the skills step renders them as grouped chips. |
| `language` | The CV's language, not the prompt's — scored in **both** directions. This is the failure that shipped: an Arabic interface producing Arabic duties on a CV the user asked for in English. |
| `no-numbers` | The only input was a job title, so every figure in a duty was invented. `hasMetric` is blunt on purpose and flags "ISO 9001" too — not noise, because a hit means the route would have stripped that line. |
| `no-brackets` | No `[insert X]` placeholders. |
| `no-echo` | A duty that is just the job title back. |
| `distinct` | No near-duplicate duties, which is how a model pads to ten lines. |

## Reading the result

The per-title lines are in the step log. The aggregate — pass rate per check, the ar/en split,
median and p95 latency, and a row for every title with a finding — is in the **job summary**,
and the same content is uploaded as the `titles-bench` artifact.

Rows are appended as each call returns, before any aggregate exists. A run killed at its
timeout therefore still leaves every result it collected; only the summary table is lost, and
that is recomputable from the rows. This is deliberate: an earlier version wrote the report at
the end, and a timeout would have thrown away a hundred completed calls.

## The exit code is a measurement, not a gate

The titles suite exits 0 even when the model does badly. Failing CI because a model phrased one
duty poorly would train everyone to ignore the run. Only a total inability to reach the
provider is an error.

## Running it

From the Actions tab, or:

    gh workflow run model-bench.yml --ref <branch> \
      -f suite=titles -f lang=both -f limit=0

Note that a `workflow_dispatch` workflow is only dispatchable when its file exists on the
**default** branch — GitHub resolves the workflow by id from there and then runs the file from
whichever ref you name. A new bench workflow added only on a feature branch answers 404 until
it merges, which is why both suites share this one file.
