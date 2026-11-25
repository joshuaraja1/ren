# Hosted image generation

Ren's hosted path keeps image generation and the provider credential off the
learner's computer. The desktop sends only a validated lesson manifest after
showing its exact contents in a native approval dialog. It never sends a screen
capture to this service. The server asks the image model for a transparent
educational image, sends that image to a separate vision model for part
locations, and streams previews and the verified result back to Ren. The
desktop independently validates the PNG, coordinates, and opaque part anchors
before adding callouts. Missing or uncertain parts restore the schematic.

The first adapter uses OpenAI's [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/guides/image-generation)
for fast transparent images and [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
for image inspection. Both requests are paid by the project operating the
server. The model configuration is server-side and can be replaced later.

## Staging setup

Build the server with `npm run build:server`, or build
`Dockerfile.image-service`. Set these server secrets in the deployment
platform's secret manager:

- `OPENAI_API_KEY`: project-owned API credential. Never place it in the desktop
  build, repository, or a browser bundle.
- `REN_IMAGE_ACCESS_DIGESTS`: comma-separated SHA-256 hex digests of 32-byte
  random Ren access tokens issued to staging testers. Store the plaintext
  tokens only in the testers' Ren settings.

Set `PORT` and `REN_BIND_HOST` for the deployment. Put the container behind
HTTPS and use the public base URL ending in `/v1`, such as
`https://images.example.org/v1`. `REN_IMAGE_STAGING_ONLY=1` is required so this version cannot be launched as
an unreviewed public service. In the OpenAI project's Limits settings, set a
monthly spend limit and enable **Enforce a hard limit**; a spend alert alone does
not stop requests. Enforcement can lag slightly. Then set
`REN_PROVIDER_SPEND_CAP_CONFIRMED=1` to start the staging service. Optional
bounds are
`REN_IMAGE_DAILY_LIMIT` (default 100), `REN_IMAGE_PER_TOKEN_DAILY_LIMIT`
(default 10), and `REN_IMAGE_MAX_CONCURRENT` (default 2). The service rejects
unauthenticated, oversized, malformed, and over-quota requests before calling
the paid provider. No generated images or prompts are stored by the service.

To make a test token, run `npm run create:image-access-token` in a trusted local
terminal. Add only the printed digest to server secrets. Give the token
to the tester through a private channel; they enter the service URL and token
once under **AI settings → Ren image service**. The token is encrypted by the
operating system's secure storage. The app can also read
`REN_IMAGE_SERVICE_URL` and `REN_IMAGE_ACCESS_TOKEN` from its environment for
local staging, without putting them in source control.

Run `npm run check` before deployment. The service and desktop protocol have
local HTTP integration tests with a mocked image provider. A live provider
test requires project credentials and may incur charges. The manual Desktop
staging workflow builds the server container, smoke tests its health endpoint,
and packages macOS, Windows, and Linux desktop apps without calling the paid
provider.

## Public-release gates

The current token list and quotas are suitable for a small, single-instance
staging service. Quotas live in process memory and reset on restart; public
deployment needs account sign-in, durable per-account quotas across replicas,
an upstream spending limit, monitoring, and an abuse response path. A real
provider account and billing must be configured before any live image test.
Cross-domain image accuracy and human review remain required before merging
the realistic illustration feature. This service is not a public endpoint yet.
