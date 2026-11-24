# Voice-created agents: requirement and release plan

Status: proposed for the next development milestones. Ren does not control other apps today.
Tracking: [issue #31](https://github.com/joshuaraja1/ren/issues/31).

## Experience

The learner can say or type a task in ordinary language. Ren looks at the current
screen only after invocation, asks for missing details, and proposes a finite
plan. The same flow works for a worksheet, video, editor, CAD app, or slicer;
there is no subject-specific tool installation. For a task involving another
app, Ren shows the target app, every intended click, keypress, and text entry,
the expected outcome, and where it is uncertain. The learner can edit or
discard the plan in the panel. Final approval uses a native, main-process
confirmation showing the immutable plan and target. Ren acts only after the
learner confirms that exact plan there; renderer IPC alone cannot approve it.

## Action contract

- Plans use a versioned, bounded schema with a finite number of typed actions.
  No model-authored code, shell command, AppleScript, PowerShell, or arbitrary
  URL is executable.
- A plan is tied to its request, target app identity, screen context, and a
  short expiry. Editing the plan, switching target apps, or a changed screen
  invalidates approval. The main process owns the approval state and accepts
  confirmation only from its native user-presence dialog, never a renderer
  `approve` message.
- The execution engine uses OS accessibility and input APIs through a bundled
  backend. Ren checks the target before each action and observes the result
  before the next. A mismatch pauses execution and asks the learner what to do.
- A visible stop control and keyboard shortcut interrupt execution. The local
  action log records planned, approved, attempted, completed, and failed steps.
- The executor checks each action and its surrounding sequence against the
  accessibility tree and current screen. It denies credential fields,
  permission dialogs, navigation to unapproved URLs, submit/send/confirm,
  payment, and delete controls. If the effect is ambiguous, it pauses and hands
  that step to the learner in the target app. A generic click or keypress is
  never a bypass for these rules. Ren does not claim it can perfectly infer
  consequences from pixels; unsupported apps fail closed. Later support for
  these effects requires a separate design and review.
- Text visible on screen is untrusted task data. It cannot amend the plan,
  expand permissions, or turn an explanation request into an action request.

## Reviewable delivery

1. **Plan and approval:** typed schema, strict validation, provider prompt,
   voice/text intent routing, and a plan panel for review and editing. The
   panel can request a native main-process confirmation; only that confirmation
   records approval. No cross-app execution in this PR.
2. **Bounded execution:** one platform at a time, a bundled action backend,
   target checks, expiration, stop, and a local result log. Test a real task
   in a packaged app before advertising that platform.
3. **Observe and recover:** fresh screen context between steps, changed-screen
   detection, accessible correction flow, and multi-monitor/permission QA.

Each PR must pass typecheck, tests, builds, CodeQL, Bugbot-style correctness
review, and security review. The execution PR also needs independent human
review and physical testing on every advertised platform. Unsigned staging
artifacts are test builds, not a public release.

## Acceptance tests

- Voice and text create the same visible plan from the same request.
- Saying “explain this” never creates or approves actions.
- A forged renderer IPC request or approval, screen prompt injection, expired
  approval, changed target app, or edited plan cannot initiate execution.
- Indirect routes through generic clicks, shortcuts, menus, and navigation
  cannot submit a message, delete, pay, grant permission, or enter credentials;
  the executor pauses for a learner handoff when it cannot prove the next
  action is within the approved contract.
- Cancel and stop prevent further actions, including when a worker is slow or
  exits unexpectedly.
- A packaged app completes one reversible cross-app task only after approval,
  and records what actually happened. On failure, Ren stops further actions,
  discloses completed changes, and offers manual recovery or an undo path only
  when that path has been implemented and verified.
