# Release and staging

## Pull-request gate

Every pull request runs type checking, unit/renderer tests, production builds,
and a production-dependency security audit. The compiled web surface is uploaded
for 14 days as `ren-web-preview` for design review.

## Staging

Every merge to `main` packages unsigned macOS, Windows, and Linux artifacts on
native GitHub runners. Artifacts are retained for 14 days and are for internal
testing only. They are not a public release and operating systems may warn about
their missing signature.

Local smoke package:

```bash
npm run pack
```

Local unsigned distributable for the current operating system:

```bash
npm run dist:staging
```

## Production release gate

A public release must not be promoted from staging until all of these are true:

- Apple Developer ID signing and notarization pass on macOS.
- Authenticode signing passes on Windows.
- Linux artifacts have checksums and provenance attestations.
- Screen, microphone, speech, auto-start, multi-monitor, and reduced-motion
  flows pass on clean operating-system accounts.
- The on-device wake provider is verified for each advertised platform. A
  remote ambient-audio fallback is not acceptable.
- Update manifests are signed and rollback is tested.
- The security support matrix in `SECURITY.md` is updated.

