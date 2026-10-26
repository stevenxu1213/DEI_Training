# CommonGround — standalone static website

## Use and publish

Open `index.html` in a browser, or publish these files to GitHub Pages:

```text
index.html
style.css
script.js
assets/
.nojekyll
```

There is no installation, compilation, framework, runtime CDN, or server API dependency. All images and fonts are local. The original Fraunces and Jost font weights and italics are preserved; licenses are in `assets/`.

For GitHub Pages, choose **Settings → Pages → Deploy from a branch**, then select the branch and root folder. The `#/portal` and `#/course/...` routes work under project URLs without redirects or a custom 404 page. Landing-page section links still work.

The optional `npm run build` command only copies the static files to `dist/` for hosts expecting a build directory. `npm run dev` is a dependency-free local static-file preview helper, not an application backend. Neither is required for GitHub Pages.

## Preserved functionality

- Full editorial landing page, expandable program cards, responsive mobile menu, section navigation and enquiry form validation.
- Portal with Courses, Achievements, AI Companion and My Learning tabs; only Basic DEI is available.
- Course introduction, simulated play/pause lesson, first-watch seek restriction, replay of watched sections, and completion gate.
- Eight individual questions, disabled submit until selection, immutable submitted answers, neutral submission audio and a remembered sound toggle.
- Results and question-by-question explanations, 85% threshold, one retry of missed questions, original and corrected scores.
- Three scripted role-play rounds, input validation, hints, delayed avatar responses, feedback and finish confirmation.
- Distinct pass/non-pass completion, once-only 100-point reward and First Step badge.
- Save/leave and resume, refresh recovery, local draft and submitted-answer persistence.

Correctness indicators that previously leaked answers immediately after submission have been removed: feedback now appears after all questions, as required by the supplied document.

## Persistence and privacy

Progress and role-play text are stored only in this browser's `localStorage` under `commonground-static-v1`. Closing the browser normally preserves progress. Clearing site data, using private browsing, moving to a different browser/device, or changing the site's origin may lose or isolate it. This is not a multi-user research database.

Storage failures show an error instead of pretending a save succeeded. Progress cannot be guaranteed if browser storage is unavailable. Do not use the demo to collect sensitive personal information. To start a separate demonstration, clear this site's browser storage; no restart-course control is exposed to participants.

An optional `?studyId=...` query parameter identifies a **new local** session; an existing browser session is resumed. This is not authenticated identity verification or a formal research data collection integration.

## Existing prototype limitations, retained explicitly

1. **Video:** the source prototype has no video asset. Its 180-second simulation runs at 5× speed (36 seconds). This is labeled on screen. It is not actual instructional video, nor evidence of participant attention. Playback pauses on navigation, refresh and tab hiding.
2. **Avatar and coach:** avatar replies and coach feedback are predefined local content, not AI. The original minimal validation rejects blank, short or nonalphabetic responses; it cannot reliably assess relevance or provide individualized coaching. No remote AI, API keys or scoring service is introduced.
3. **Enquiry:** the original form only displayed an acknowledgement. It still validates and acknowledges locally, but now clearly says that nothing was sent. No email or submission backend exists.
4. **Qualtrics:** the original return button only displayed an alert. Set the public `SURVEY_URL` constant at the top of `script.js` to the researcher-provided HTTPS URL. Return attempts append `studyId`, `course` and `status` query parameters. Without a URL, the button explains how to return to the original survey tab; it does not claim a successful redirect.
5. **Research integration:** local state is not a substitute for audited research records, actual post-survey verification, or a secure data-management system. Extra courses, free practice and AI Q&A remain locked. No post-survey completion is inferred from clicking Return.
6. **Fault handling:** there is no real video/network/AI request to fail, retry or time out. The existing Technical Interruption presentation is retained, but production network-failure recovery requires real content and integrations. Browser history preserves saved state but does not guarantee an exit prompt for browser Back or closing a tab.

The original interaction requirements document is included in `assets/DEI_Interaction_Requirements_v1_0.docx`. Production teaching content, scripted feedback and the actual survey return URL still require researcher review, just as before this migration.

## Verification

`node --check script.js` checks JavaScript syntax. `tests/browser-smoke.cjs` exercises the real site through Chromium's DevTools protocol without any test package dependencies (Node 22+ and Chromium debug port 9222 required). Set `TEST_URL` to test a hosted project URL; otherwise it opens `index.html` directly. Test data is isolated to the browser profile used for testing and is cleared by the suite.
