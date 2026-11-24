# Display and permission QA

Automated geometry tests cover a secondary display left of the primary and a
display stacked above it. The capture request now fixes the target display and
pointer together, and the transparent annotation window follows that display.

Physical release checks on each OS:

1. Grant microphone and screen recording once, quit, relaunch, and confirm no
   repeat permission prompt.
2. Put a second display left of the primary. Point to a distinctive object on
   it, ask Ren to mark it, and confirm the drawing appears there.
3. Move that display above the primary and repeat. Check the screen edges and a
   cursor at the midpoint.
4. Start a question on the secondary display, move the cursor to the primary
   display while Ren thinks, and confirm the original display remains the target.
5. Disconnect the secondary display while Ren is open. Confirm a later question
   uses the remaining display and stale drawings can be cleared.
6. Deny microphone access, relaunch, and confirm a visible fallback with no
   listening claim. Repeat after granting access in system settings.

These physical checks require the respective OS and two displays; automated
geometry tests and package creation do not substitute for them.

# Circle-to-focus checks

- Grant Accessibility and Input Monitoring once on macOS, restart Ren if the OS
  requests it, and verify the shortcut works in another app without a new prompt.
- Hold Control+Option (Control+Alt on Windows/Linux) and draw a closed circle on the primary display. Confirm the
  visible path follows the cursor, closes on release, and Ren explains the
  selected region using a close crop.
- Repeat on a display left of and above the primary. The selection, crop, and
  expanded Ren panel must stay on that display.
- Draw an open stroke, press Escape, click during a gesture, and cross displays.
  Each must cancel without submitting a question.
- Draw an annotation, then scroll with a mouse wheel and trackpad. The drawing
  must disappear before it can point to a different part of the page.
- Begin a circle and scroll before releasing. The circle must cancel. Disconnect
  or resize the selected display and confirm old selections and drawings clear.
- Verify the underlying app receives no synthetic click or typing from Ren.
