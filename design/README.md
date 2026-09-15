# Werkbank — Workshop 02

Refined standalone design preview. Production (`werkbank-v2.html`), the original tools and other preview pages are unchanged.

## Build

From the repository root:

```sh
python3 scripts/build-workshop.py
```

The builder uses the production file and bundles `design/workshop.css`, `design/workshop.js` and `design/polish.js` into `werkbank-design-preview.html`. No runtime fonts, image requests or external scripts. All illustrations are local SVG markup. Editable sources are separate from the generated deliverable.

Storage remains isolated under `werkbank.design.v1.*`, preserving projects already created in Workshop 01. Production keys are never read or changed. Export/import can explicitly transfer a project.

## Changes

- Compact project header, persistent cost/save control, proper keyboard-operable tab panels, clear project library and real recent projects.
- Technical profile illustrations for all 18 profile choices, sensible ordering, full-width search, keyboard focus and no forced software keyboard.
- Short material cards with price first; weights, purchase costs and breakdowns in disclosures.
- One material selector per editor. Material changes refresh catalog choices and clear incompatible articles.
- Redraw guard prevents real-browser blur events from overwriting newly selected catalog dimensions.
- Editing a saved line retains its price even after catalog changes. Price basis changes require a new price; catalog reset is explicit.
- Saving updates the currently open project instead of creating duplicates. Failed or corrupt storage is not overwritten. Existing snapshots are retained.
- Navigation retains an in-memory draft; replacing it asks about unsaved changes. Amount-only string/number differences do not cause false dirty warnings.
- Dialog background is inert, body scrolling is locked and focus cycles only through usable controls. Escape restores focus. Print opens all sections and restores their previous state afterwards.

## Verification, 15 September 2026

Passed on the generated HTML, not a separate demo:

```sh
node tests/design-material-calculator.test.js
node tests/design-material-wizard.test.js
NODE_PATH=/tmp/werkbank-tests/node_modules node tests/design-dom.test.js
NODE_PATH=/tmp/werkbank-tests/node_modules node tests/design-browser.test.js
NODE_PATH=/tmp/werkbank-tests/node_modules node tests/design-browser-edge.test.js
```

Install test dependencies outside the app:

```sh
npm install --prefix /tmp/werkbank-tests jsdom@30.0.1 playwright@1.62.1
/tmp/werkbank-tests/node_modules/.bin/playwright install chromium
```

An installed Chromium binary can instead be supplied through `WERKBANK_CHROMIUM=/absolute/path/to/chromium`. Both browser tests start and stop their own loopback HTTP server (ports 8878 and 8879). Screenshots are regenerated in `design/screenshots/`.

Evidence:

- Chromium at 320, 390, 430 and 1280 px, both dark and light: no document overflow, duplicate IDs or page errors along the tested route.
- Native profile and actual catalog choice → dimensions → add → price edit → save twice → reload → reopen → labor → overview → duplicate → remove/undo → search.
- Saved price survives later catalog changes and dimension edits. Explicit reset uses the new catalog price. Changing price basis cannot silently reuse the old number.
- All 115 catalog articles validate with their supplied metadata and a requested length. The UNP/UPN table alias and missing supplier references on UPE/T articles were corrected in the preview adapter; no engineering table values changed. UNP, UPE and T catalog articles were additionally exercised through actual browser form selection.
- All 18 real profile routes open and cancel; focus stays inside the dialog and background is restored afterwards.
- Storage quota failure leaves saved data unchanged. A browser denying access to localStorage still opens the app and shows an actionable message.
- Existing calculation, migration, import and storage tests plus complete HTML JSDOM route pass.

The screenshots in this folder are real Chromium renders. The standard browser download timed out; this session used the Chromium 153 binary packaged in `@sparticuz/chromium@153.0.0`. No WebKit or physical iPhone/Safari test was run. Mobile Chromium emulation is not proof of Safari keyboard/safe-area behavior.

## Review and apply

After merging this preview-only PR and successful Pages deployment:
https://nicksnoerwang-t12.github.io/calculator-app/werkbank-design-preview.html

Look for “Workshop 02”. The URL is not a branch deployment; before merging it may still show Workshop 01.

To promote to production later, integrate the presentation with production storage keys and explicitly test saved-project compatibility. Do not blindly copy the isolated preview over the live app. No production promotion is included here.
