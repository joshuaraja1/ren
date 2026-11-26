# Connected visual lessons

Status: subject-derived 2D diagrams and approximate rotatable 3D teaching models
are implemented. Realistic arbitrary meshes remain future work. Tracked in
[issue #35](https://github.com/joshuaraja1/ren/issues/35).

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

An ordinary diagram request starts as a 2D diagram. An explicit 3D object request
uses the same validated lesson parts to plan bounded 3D primitives and anchors
for that subject; the F-35 is no longer a special routing rule. The resulting
model rotates with cursor movement. A follow-up such as “make it 3D” keeps the
visible lesson's subject and part IDs rather than planning an unrelated object.
Parts remain connected to the geometry as
it turns. Longer lessons page their callouts when the learner holds the cursor
in a top corner, so orbiting alone does not replace labels. Geometry is an
illustrative approximation; it cannot promise a faithful mesh of every object
or exact internal engineering detail. A separate 3D asset provider would be
needed for high-fidelity arbitrary meshes.

For a browser check of the actual Three.js renderer, run `npm run preview:graphics`
and open `http://127.0.0.1:5173/graphics-preview.html`. This builds the renderer
first and serves the Pi camera and desktop PC fixtures. Pointer orbit, labels,
and assembly replay work in the page. It is a local renderer preview, not a
screen capture or model-provider end-to-end test.
The earlier `/visual-preview.html` link resolves to the same preview.

## Rendering contract

The answer model returns a small versioned manifest: a title, any assumption,
component IDs, names, short explanations, an on-screen placement rectangle,
positions inside that rectangle, and labeled connections. Main validates this
manifest before it reaches the overlay renderer.
For 3D, a second bounded model plan specifies primitive kind, dimensions,
rotation, color, and a 3D anchor for every lesson part. The renderer only
constructs fixed Three.js shapes and bounded extruded silhouettes from the
validated plan; it never executes
model-supplied code or loads remote mesh URLs. A connected vector preview is
shown while this plan is prepared. If planning or WebGL fails, Ren keeps a 2D
part diagram visible. Dense 2D and 3D lessons retain every part and page the
callouts according to display height.
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

The first image adapter uses the OpenAI Image API with a fast, medium-quality
render and partial previews after the learner presses a control and approves
a native dialog showing the exact screen-derived text sent and possible
provider charges. One image request is allowed per lesson. It sends only a
reduced, validated manifest with title, part names, and connections. The image
is composed into the same transparent overlay and marked as an illustration.
The schematic callouts are hidden during partial previews. After generation,
Ren sends the generated image to the configured vision model to locate every
manifest part independently. It accepts a complete, confident, distinct set of
coordinates on opaque pixels; then the callouts and connections are registered
to the contained image. Missing or ambiguous parts return to the schematic.
This is a conservative placement check, not proof of engineering accuracy.
Voice-only image requests, other image providers, and physical QA remain open.

The draft hosted route moves image generation and independent part registration
to a Ren server. The desktop sends only the validated title, assumption, part
IDs/names, and connections after a native dialog shows the exact manifest and
destination. The server holds the provider key, streams previews, and returns
part coordinates only after the vision check. Ren still validates PNG bytes,
coordinates, and opaque anchors before attaching callouts. This route needs a
deployed service, project funding, and real-image QA before public release;
see [hosted images](HOSTED_IMAGES.md).

Ren uses OpenAI for on-demand screen understanding. The desktop no longer autodetects or connects to Ollama.

The image backend receives the validated manifest only by default. Sending a
screen frame, crop, selected text, or app content to an image provider requires
a separate, clear data disclosure and user consent for that provider. The
same sensitive-app exclusions apply to answer and image requests.

The visual is tied to a particular display and screen context. Ren clears or
repositions it when scrolling, panning, changing displays, or switching tasks
would make its callouts misleading. The user can hide it immediately. The
overlay stays click-through so the underlying app remains operable; pointing
and voice are the default ways to refer to its parts.

The first renderer uses still pixels from a short capture burst as a screen
anchor, so an ordinary playing video does not cancel the lesson. A click or
key during an in-flight answer cancels the answer, covering normal tab and app
switches. This is not proof of browser tab identity: automatic navigation or
two visually similar dynamic views can evade that check. Ren rejects a drawing
when too few still pixels remain to anchor it. If global interaction tracking
is unavailable, Ren returns the text answer but suppresses spatial drawings
for moving content. A future browser-aware context
adapter and physical video/tab-switch QA are release follow-ups.

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
4. **Verification:** image-to-manifest placement implemented; cross-domain evaluation set,
   latency and accuracy measurements, physical packaged QA, and human review.

Benchmarks must record time to first useful diagram, first realistic preview,
final render, part identification accuracy, link placement, hallucinated
labels, memory, and cancellation. Scenarios must include engineering systems,
math, chemistry, software, biology, and unfamiliar topics. Release targets
will be set from measured baselines; this document does not claim instant
photorealistic rendering.
