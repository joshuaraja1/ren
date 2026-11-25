# Release and staging

## Pull-request gate

Every pull request runs type checking, unit/renderer tests, production builds,
a full-dependency high-severity audit, and CodeQL analysis. The compiled web surface is uploaded
for 14 days as `ren-web-preview` for design review.

## Staging

Every merge to `main` packages unsigned macOS, Windows, and Linux artifacts on
native GitHub runners. Artifacts are retained for 14 days and are for internal
testing only. They are not a public release and operating systems may warn about
their missing signature.
On macOS, unsigned rebuilds do not have a stable identity for Screen Recording
and Keychain permission testing. Use a locally signed `npm run pack` build with
a Developer ID certificate for those checks. Verify that `codesign -dv
release/mac-arm64/Ren.app` reports `Identifier=ai.ren.teacher` and the expected
Developer ID authority before testing permission onboarding. See
[Apple's code signing identity guidance](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)
and [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
If macOS shows Accessibility or Microphone enabled while Ren still reports it
missing after switching from an unsigned build, remove the old Ren entry in
System Settings → Privacy & Security, launch the signed build, and grant its
fresh request. Ren checks permissions again and starts the circle and voice
listeners when macOS grants them.

Local smoke package (signs automatically when a Developer ID certificate is
available):

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

