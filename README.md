# Recipes

Recipes is a local-first vegetarian kitchen at `harsh.bet/recipes/`. It turns products into meal ideas, works backward from recipes into a shopping list, and keeps nutrition math tied to the product-label data that produced it.

## Product boundaries

- Ovo-lacto vegetarian only: eggs and dairy are supported; meat, fish, shellfish, gelatin, animal stock, and similar ingredients are blocked.
- Unclear ingredient labels fail closed and require an explicit owner review before entering the pantry.
- Nutrition is deterministic. Generated recipes snapshot the selected product and its macros, so later pantry edits do not silently rewrite an old recipe. A product cannot enter the pantry until its source includes calories, protein, carbohydrate, and fat; optional ingredients are excluded from baseline totals.
- The app is not medical or allergy advice. Always verify the package label.
- H-E-B is an outbound shopping link, not a scraped source. Product discovery uses open databases or manual label entry.

## Data sources

| Source | Use | Access |
| --- | --- | --- |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) | Generic and branded nutrition search | The documented `DEMO_KEY` supports low-volume exploration; deploy with a personal FDC key only through a server-side proxy if higher limits are needed. USDA data is public domain/CC0. |
| [Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/) | Packaged products, Indian brands, frozen foods, and barcode lookup | Read access requires no API key. Searches are explicit-submit to respect the published rate limits and attribution/share-alike terms. |
| Manual label entry | Products missing from open databases | Stored only in the owner's local/private app state. |
| Firebase AI Logic | Optional recipe wording and steps | Loaded on demand for a signed-in, owner-vault-resolved client. App Check and Firebase authenticated-users mode protect the service; the app constrains product IDs, recomputes macros from snapshots, and rejects unsafe output. |

The starter catalog and smart recipe engine work without network access or API credentials.

## Architecture

- React, TypeScript, Vite, and a responsive PWA shell under the `/recipes/` base path.
- IndexedDB with a localStorage fallback for immediate offline use.
- Optional private Google sign-in and a single whole-state Firestore vault document at `recipes_vaults/{vaultId}`.
- Monotonic last-write-wins sync using `updatedAtMs`, `updatedAt`, and `clientId`, with a pristine-device guard before the first cloud write.
- Open Food Facts and USDA adapters with normalization, request throttling, caching, and strict vegetarian classification.
- Local smart templates plus an optional structured-output Firebase AI recipe generator using the Firebase-supported `gemini-3.6-flash` model.

## Local development

```bash
npm ci
npm run dev
```

The public Firebase web configuration identifies the existing project; it is not an admin credential. Do not commit service-account credentials, private API keys, or owner data.

For local testing of production AI requests, create `.env.local` with the public reCAPTCHA Enterprise site key configured for Firebase App Check. Production receives the same public value from the repository's `VITE_FIREBASE_APPCHECK_SITE_KEY` variable:

```bash
VITE_FIREBASE_APPCHECK_SITE_KEY=your_public_site_key
```

Firebase AI Logic and App Check must also be enabled for the existing Firebase web app in the Firebase console. Without that configuration, the local smart generator remains fully available and the AI button shows a setup message.

## Verification

```bash
npm test
npm run test:rules
npm run typecheck
npm run build
```

`firestore.rules` is the complete shared `pickledgerpro` ruleset. It must remain byte-identical to Daymark, Degree, Fare, Goals, Gym, Notes, Radar, Research, and Slate; deploying a partial file would replace every app's production rules.

## Deployment

Pushes to `main` run `.github/workflows/deploy-pages.yml`, verify the app and shared Firestore rules, and publish the artifact to GitHub Pages. The project repository does not contain a `CNAME`; it inherits `harsh.bet` from the user-site repository.
