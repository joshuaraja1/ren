# Engineering lifecycle

Ren is developed through small pull requests tied to a requirement or issue.
The default branch is protected: changes enter through a PR after the required
quality check passes. Force pushes and branch deletion are disabled. Review
threads must be resolved before merging.

## Before opening a PR

1. Link the requirement or issue and state the user-visible outcome.
2. Describe permission, privacy, accessibility, and platform effects.
3. Run `npm run check` and relevant manual checks. Include evidence and name
   anything that could not be tested.
4. Keep screenshots, microphone recordings, and provider keys out of commits
   and CI logs.

## Review and merge

Review the diff for correctness, failure recovery, privacy, and test coverage.
For Electron IPC, native input, capture, credentials, or network changes, inspect
the trust boundary and add a focused regression test. Resolve every actionable
review thread before merging. Merge one PR at a time so each staging result maps
to a specific revision. A comment-only review is recorded as feedback; it is
not an independent approval.

GitHub does not let a PR author approve their own PR. While this repository has
only one maintainer, the protected branch enforces a PR and automated checks;
the owner records a review assessment in the PR. Once another maintainer has
review access, require at least one approval from someone other than the author.
Security-sensitive changes should receive that independent review before a
public production release.

## After merge

`main` runs CI, CodeQL, and unsigned desktop staging packages for macOS,
Windows, and Linux. Inspect all three staging jobs and retry an infrastructure
cancellation on the same commit. A passing package job proves the artifact was
built; it does not prove microphone, global input, or multi-monitor behavior.
Record physical acceptance against `docs/MULTI_MONITOR_QA.md` and the relevant
issue. Use `docs/RELEASE.md` before signing or publishing any production release.

Report failures with the exact run, platform, reproduction, and whether the
issue blocks staging or release. Fix product defects in a new focused PR;
do not weaken a gate to make a red run green.
