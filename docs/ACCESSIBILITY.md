# Accessibility checks

Patchboard's automated checks exercise the browser accessibility tree and
rendered layout. They don't prove WCAG conformance or replace testing with a
screen reader.

Run `npm run test:a11y` and `npm run test:zoom` with Chrome or Chromium
installed. Set `CHROMIUM_PATH` if needed. CI runs the same checks after building, against a temporary demo
database; it never uses your saved boards or integration settings.

## Built in

- **Hold to confirm** (Stop, Restart, Update, Remove) also works without
  holding: a screen reader, voice control or switch press arms the button,
  and a second press within five seconds confirms.
- **Single-key shortcuts** (/, ?, g then a letter, j and k) can be turned
  off in Settings, Look, Keyboard, for speech input. Ctrl K always works.
- **Arrange board** works without dragging: Move earlier, Move later, a
  Column menu and width buttons. A move keeps focus on the widget and says
  where it went.
- **Overlays** hold focus, close with Escape and return focus to what
  opened them. Focus moves into an opened article.

## Automated coverage

- Home, Server, Stacks, Reading, Upcoming, Apps, and Home/Connections settings:
  accessible names for exposed controls, meters, dialogs and navigation; one
  main landmark and named navigation.
- Reflow at 960 and 320 CSS pixels, the content widths of a 1920px window at
  200% zoom and a 1280px window at 400%. No page may scroll sideways, except
  the poster rows built to scroll.
- Home in light and dark forced-color palettes: visible usage bars, distinct
  memory segments, header card outlines, and a named keyboard-help dialog
  that fits a narrow viewport.
- Usage meters expose their subject and percentage; charts expose their
  purpose, including the unavailable-history state.
- Afterward, the check confirms the saved setup is unchanged.

A separate script, `npm run test:ui`, checks Home placement, full poster
rows, Fit, keyboard containment, Escape, focus return, cancelled editor
drafts, import cancellation and the skip link. Unit tests cover theme text
contrast.

Home header with Chromium’s dark forced-color palette:

![High-contrast Home header retains card outlines and visible usage bars](screenshots/home-header-contrast.webp)

## Actual browser zoom and enlarged text

`npm run test:zoom` uses a temporary Chromium profile and the browser's own
zoom preference. It verifies the device pixel ratio changes at 100%, 200%
and 400%, then visits the same eight views and opens the Server editor.
The document must avoid horizontal scrolling, the editor must fit, and its
Save action must scroll into view. Cancelling must leave the saved setup as
it was.

It then sets Chromium's minimum font to 24px and checks those views again.
Home weather lines, Reading metadata and calendar times must not overlap.
This is a real browser font setting, separate from Firefox's text-only zoom.
The script deletes the temporary profile and leaves the shared browser
alone.

## Manual release checks still required

Use a real install with representative integration data, and record the
browser, OS, assistive technology and result:

1. Use NVDA with Firefox or Chrome, or VoiceOver with Safari. Navigate by
   landmarks and headings, then follow Home links, read server measurements,
   open playback previews, and edit and cancel a board. Check announced names,
   values, expanded states, dialog boundaries and focus return.
2. Repeat 200% and 400% zoom in supported browsers, and test Firefox’s
   text-only zoom. Check every view and editor for clipped controls,
   unreadable truncation, lost content and horizontal document scrolling. Poster rows should retain
   their items and remain reachable by keyboard.
3. On Windows, turn on a real contrast theme. Check keyboard focus, selected
   tabs, disabled actions, warnings, graphs and dialogs. Chromium's emulation
   covers system-color rendering but not every OS/browser combination.

Actual Chromium zoom and minimum-font checks pass in the cloud environment.
A spoken screen-reader walkthrough, Firefox text-only zoom and native Windows
contrast-theme checks still need their own platforms. Keep the
accessibility roadmap item open until these manual checks are recorded.
