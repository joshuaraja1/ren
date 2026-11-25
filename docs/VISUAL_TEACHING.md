# Connected visual lessons

Status: requirement and first schema implementation. Tracked in
[issue #35](https://github.com/joshuaraja1/ren/issues/35). Ren does not yet
generate realistic teaching images.

## Experience

A learner can ask “show me how this plane works” while pointing at a plane,
ask about a chemistry setup, or ask to visualize an algorithm. Ren identifies
an appropriate scope from the question and available context. It presents a
parts-and-relationships diagram with selectable components, then can add a
realistic image for spatial intuition. Selecting a part highlights its links
and reads its explanation. Follow-ups reuse the same lesson when possible.

There is one visual lesson system for every subject. A learner does not install
or choose a diagram, aircraft, chemistry, or coding tool.

## Rendering contract

The answer model returns a small versioned manifest: a title, any assumption,
component IDs, names, short explanations, normalized positions, and labeled
connections. Main validates this manifest before it reaches the renderer.
Unknown fields, unbounded text, missing endpoints, and disconnected graphs do
not become executable or displayable geometry. The first implementation is
[`visual-lesson.ts`](../electron/visual-lesson.ts).

Ren owns the diagram renderer and keeps labels and callouts as selectable
vector UI. This produces a useful visual quickly and keeps text legible at
any zoom. A separate image backend may generate a realistic cutaway or scene
using the validated manifest. The provider is selected internally from the
configured capability; unsupported providers leave the diagram usable. Image
generation must be cancellable, bounded in bytes and time, and show partial
previews when the provider supports them. The app discloses the image provider
and any charge before the first generation.

Generated imagery is marked as illustrative. Ren checks it against the
manifest before using it as an explanation, and overlays labels from the
validated manifest rather than relying on image-embedded text. If the object
or mechanism is ambiguous, Ren states the assumption. A generated drawing is
not a manufacturing drawing, dimensional specification, or proof of operation.

## Reviewable PR sequence

1. **Contract:** requirements, validated manifest, and tests.
2. **Fast diagram:** accessible panel, interactive component selection, links,
   callouts, answer synchronization, and keyboard/reduced-motion tests.
3. **Realistic image:** optional image adapter, previews, cancellation, resource
   bounds, provider disclosure, fallback, and security tests.
4. **Verification:** image-to-manifest review, cross-domain evaluation set,
   latency and accuracy measurements, physical packaged QA, and human review.

Benchmarks must record time to first useful diagram, first realistic preview,
final render, part identification accuracy, link placement, hallucinated
labels, memory, and cancellation. Scenarios must include engineering systems,
math, chemistry, software, biology, and unfamiliar topics. Release targets
will be set from measured baselines; this document does not claim instant
photorealistic rendering.
