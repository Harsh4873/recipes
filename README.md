# Recipes

Recipes is a recipe-first vegetarian meal library at `harsh.bet/recipes/`. It presents 100 substantial lunches and dinners with deterministic macros, clear cooking steps, and practical grocery guidance.

## Product boundaries

- The catalog is ovo-lacto vegetarian: eggs and dairy are supported; meat, fish, shellfish, gelatin, animal stock, and similar ingredients are blocked.
- Every catalog meal is designed as one substantial serving with at least 800 calories.
- Nutrition totals are calculated from curated ingredient snapshots rather than entered as recipe-level estimates.
- Each ingredient explains what to buy and links to relevant retailer searches. Curated format picks are static guidance, not live price, inventory, or aisle data.
- The app does not scrape retailer pages and does not claim that a displayed pick is the current cheapest option.
- Nutrition and grocery notes are informational, not medical or allergy advice. Always verify the current package label.

## Catalog sources

- Generic ingredient nutrition uses curated references from [USDA FoodData Central](https://fdc.nal.usda.gov/).
- Ingredient snapshots use typical reference values; the current package label remains authoritative for a specific product.
- Retailer links are outbound searches assembled from the curated ingredient guide; no retailer data is fetched at runtime.

The recipe catalog and grocery guide ship with the site and require no product-search service or private API credential.

## Retailer handoff

- H-E-B, Walmart, and Instacart buttons are outbound searches so the retailer can resolve the current store, package, price, and availability.
- The site intentionally does not store or scrape retailer content. H-E-B's [terms](https://www.heb.com/terms) note that prices, inventory, and store information can vary.
- Instacart's hosted recipe and shopping-list [developer API](https://docs.instacart.com/developer_platform_api/) requires private server credentials, so it is not embedded in this static GitHub Pages app.

## Architecture

- React, TypeScript, Vite, and a responsive PWA shell under the `/recipes/` base path.
- A static catalog of substantial vegetarian recipes, normalized ingredients, macro snapshots, and grocery recommendations.
- Client-side recipe search and filters that work without a network request.
- IndexedDB with a localStorage fallback for saved recipes, shopping-list state, and preferences.
- Optional private Google sign-in and a single whole-state Firestore vault document at `recipes_vaults/{vaultId}` for cross-device sync.
- Monotonic last-write-wins sync using `updatedAtMs`, `updatedAt`, and `clientId`, with a pristine-device guard before the first cloud write.

## Local development

```bash
npm ci
npm run dev
```

The public Firebase web configuration identifies the existing project; it is not an admin credential. Do not commit service-account credentials, private API keys, or owner data.

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
