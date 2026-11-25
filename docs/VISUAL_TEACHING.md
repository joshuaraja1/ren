# Connected visual lessons

Status: validated schema and first on-screen schematic implementation. Tracked in
[issue #35](https://github.com/joshuaraja1/ren/issues/35). Ren does not yet
generate realistic teaching images.

## Experience

A learner can ask “show me how this plane works” while pointing at a plane,
ask about a chemistry setup, or ask to visualize an algorithm. Ren identifies
an appropriate scope from the question and available context. It draws a
parts-and-relationships explanation **directly over the user's current
screen**, like the reference's aircraft cutaway and callouts over a web page.
It can add a realistic image for spatial intuition in the same transparent
overlay. The existing app remains visible and usable underneath. Pointing at a
part and asking a follow-up highlights its links and explains it. Ren reuses
the lesson when possible.

There is one visual lesson system for every subject. A learner does not install
or choose a diagram, aircraft, chemistry, or coding tool.

## Rendering contract

The answer model returns a small versioned manifest: a title, any assumption,
component IDs, names, short explanations, an on-screen placement rectangle,
positions inside that rectangle, and labeled connections. Main validates this
manifest before it reaches the overlay renderer.
Unknown fields, unbounded text, missing endpoints, and disconnected graphs do
not become executable or displayable geometry. The first implementation is
[`visual-lesson.ts`](../electron/visual-lesson.ts).

Ren owns the transparent, click-through screen overlay. It places diagram
geometry, labels, and callouts there as vector elements; it does not open a
lesson canvas or move the user into another surface. The main Ren pebble
remains a voice control and transcript. A separate image backend may generate
a cutout or scene using the validated manifest, then compose it into the same
overlay. The provider is selected internally from the configured capability;
unsupported providers leave the on-screen diagram usable. Image generation
must be cancellable, bounded in bytes and time, and show partial previews when
supported. The app discloses the image provider and any charge before the
first generation.

The image backend receives the validated manifest only by default. Sending a
screen frame, crop, selected text, or app content to an image provider requires
a separate, clear data disclosure and user consent for that provider. The
same sensitive-app exclusions apply to answer and image requests.

The visual is tied to a particular display and screen context. Ren clears or
repositions it when scrolling, panning, changing displays, or switching tasks
would make its callouts misleading. The user can hide it immediately. The
overlay stays click-through so the underlying app remains operable; pointing
and voice are the default ways to refer to its parts.

Generated imagery is marked as illustrative. Ren checks it against the
manifest before using it as an explanation, and overlays labels from the
validated manifest rather than relying on image-embedded text. If the object
or mechanism is ambiguous, Ren states the assumption. A generated drawing is
not a manufacturing drawing, dimensional specification, or proof of operation.

## Reviewable PR sequence

1. **Contract:** requirements, validated manifest, and tests.
2. **Fast on-screen diagram:** transparent overlay composition, placement,
   connected callouts, pointer/voice reference, clear control, and multi-display
   and reduced-motion tests. The first connected drawing is implemented;
   physical multi-display QA and pointer-based part selection remain open.
3. **Realistic on-screen image:** optional cutout image adapter, progressive
   previews, overlay composition, cancellation, resource bounds, provider
   disclosure, fallback, and security tests.
4. **Verification:** image-to-manifest review, cross-domain evaluation set,
   latency and accuracy measurements, physical packaged QA, and human review.

Benchmarks must record time to first useful diagram, first realistic preview,
final render, part identification accuracy, link placement, hallucinated
labels, memory, and cancellation. Scenarios must include engineering systems,
math, chemistry, software, biology, and unfamiliar topics. Release targets
will be set from measured baselines; this document does not claim instant
photorealistic rendering.
