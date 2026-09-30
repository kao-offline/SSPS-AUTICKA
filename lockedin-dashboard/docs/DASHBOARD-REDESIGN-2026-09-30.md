# Dashboard redesign

## Changes

- Copied the supplied Downloads/LOCkEDIN.svg to public/media/lockedin.svg unchanged. Dashboard logo sizing now uses the SVG's actual aspect ratio; CSS adds a blue glow with a softer light-mode treatment.
- Unified the dashboard, HeroUI controls, dialogs, and plugin SDK around the document-root theme. Saved preferences override the operating system, apply before paint, persist across reloads, and synchronize across tabs. Retained the body class for existing plugins.
- Increased foreground/secondary-text contrast and separated cards, controls, borders, and selected navigation in both themes. Corrected pale active icons on light surfaces.
- Gave Accounts, Publisher, API Keys, and the three server screens consistent headers, spacing, surfaces, and primary actions. Removed repeated introductory text and the static server setup stepper.
- Publisher has a searchable published list and a responsive upload/preview layout. Removed the fixed viewport-height layout that clipped smaller screens.
- API keys have search/status filters, readable dialogs, accessible endpoint checkboxes, and a mobile endpoint chooser. Empty endpoint plugins are omitted from that chooser.
- Server connections, the module library, and installed modules use visible section navigation. Setup commands display the actual dashboard origin; file upload controls adapt to both themes.

## Functional issue found

Production parking plugin endpoint metadata was empty, preventing scoped-key creation in the UI. Registered getSpaces, getMap, and updateSpaceStatus from its checked-in manifest using the authenticated plugin tool. No plugin code/artifact was replaced. The CLI also now accepts BOM-prefixed manifests.

## Verification

- 30 tests passed, including five regression cases checking explicit theme preferences and consistent pre-paint initialization.
- TypeScript and production build passed; npm audit reported zero vulnerabilities.
- Lint ran without weakening rules and still fails with 172 existing errors and 52 warnings; five loose types were removed from touched UI files.
- The collaborative browser signed into a local preview with the actual production admin/backend. Checked account data, both themes, the supplied logo and glow, published/upload views, all three server sections, and API-key permissions/review without submitting a new key.
- Checked layout at 1280×800 and 390×844. The mobile screens and key form did not overflow the document horizontally. Measured dark foreground and secondary-text contrast against the card surface at 15.30:1 and 8.30:1 respectively. Browser screenshot transport was unavailable, and the preview host disconnected near the end; no screenshots or later browser checks are claimed.
- The temporary local credential bridge was removed before build/deployment. It was not committed or deployed, and credential values were not printed.

Deployment remains the existing Vercel project behind https://li.kaooffline.top. The deployed revision and deployment ID are recorded in the local audit handoff and final response. The previous Vercel production deployment remains a rollback handle. This change does not deploy device hardware or the separate data-server project.
