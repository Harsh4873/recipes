# Recipes Maintenance

Recipes is the owner's private, local-first vegetarian recipe and pantry workspace, published at `harsh.bet/recipes/`.

## Product Boundary

- Recipes lives on `main` and publishes under `/recipes/`.
- The diet boundary is ovo-lacto vegetarian: eggs and dairy are allowed; meat, poultry, fish, shellfish, animal stock, gelatin, lard, and tallow are blocked.
- Unknown packaged-food eligibility fails closed until the owner reviews and approves the label.
- Nutrition totals are deterministic calculations from stored product snapshots. Generated recipe text never supplies authoritative macros.
- Product data and recipe history stay on the device unless the owner signs in for private Firebase sync or explicitly exports them.
- Do not scrape H-E-B or other retailer pages. Use USDA FoodData Central, Open Food Facts, manual label entry, or user-provided links.
- `firestore.rules` is the complete shared `pickledgerpro` ruleset and must stay byte-identical to the sibling private apps after any shared-rules change.

## Verification

- Never open the deployed site, a browser preview, rendered output, or a live URL. The owner confirms production.
- Before publishing, run `npm test`, `npm run test:rules`, `npm run typecheck`, and `npm run build`.

## Ship every change to harsh.bet

A request to add a feature, fix a bug, or change this app is standing permission to deploy it to the harsh.bet domain in the same session so the owner can see it immediately. Do not stop at local code. Do not wait for a separate commit, push, or deploy ask.

1. Implement and verify from source using this repository's tests, typecheck, and build.
2. Commit on `main` as GitHub user `Harsh4873` (`Harsh4873 <43502626+Harsh4873@users.noreply.github.com>`). Verify with `gh api user` and the commit author. Never invent or switch identity.
3. Keep commit messages and code free of AI-editor fingerprints: no co-author trailers, editor taglines, or assistant metadata. If the environment injects a trailer, rewrite the commit with git plumbing before pushing.
4. Push to `origin/main`. That push runs `.github/workflows/deploy-pages.yml` and deploys to GitHub Pages on harsh.bet.
5. Confirm the workflow with `gh run list` and `gh run view`. Never open production to verify it.

Do not force-push to `main`. Leave unrelated dirty files out of the commit.

## Privacy

This repository deploys publicly. Never write the owner's real name, personal email, home location, private food history, API secrets, or other personal details into committed files or commit messages. Refer to "the owner" generically. The GitHub commit identity `Harsh4873` is the only owner reference that belongs in the repo.
