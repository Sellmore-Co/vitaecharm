# Production Pass Log — VitaeCharm Body Oil

- **Campaign slug (public route):** `vitaecharm` → routes `/vitaecharm/body-oil/`, `/vitaecharm/checkout/`, `/vitaecharm/receipt/`
- **Map ID / spec identity:** `body-oil-y856` (map:body-oil-y856), spec `campaign-spec-body-oil (1).json` v4.3
- **Campaign ref_id:** 1615 · **SDK:** 0.4.24 · **Family:** shop-single-step (custom PageFly PDP clone) · **Market:** US/USD
- **Build skill:** next-campaigns-build · **Branch:** claude/bold-torvalds-596847
- **Mode:** existing_campaign_update — campaign was already built from this spec; this pass is assembly-gate verification.

## Stage: build — COMPLETED

### Spec ↔ runtime-truth reconciliation (live API confirmed in-browser)
The Campaigns campaign store loaded **10 live packages** matching the spec exactly.
Tier→package map in `src/vitaecharm/assets/js/clone-adapter.js` (`TIERMAP`):

| Tier | Subscription pkg / price | One-time pkg / price |
|---|---|---|
| 1 | ref 2 = $32 (recurring $38) | ref 9 = $38 |
| 2 | ref 4 = $57 | ref 10 = $76 |
| 3 | ref 5 = $75 | ref 11 = $114 |

Free-gift offers (`GIFTS`, 100%-off): Mitt (pkg 3, @1+), Collagen (8), Nail Oil (7),
Sleep Mask (6) @2+. "FREE Body Oil" (min-2) handled structurally via tier math.
Shipping: single method `default` $3.95 (ref 1).

### Verification performed
- `config.js` loads before SDK CDN loader; `apiKey` matches spec key; `storeName: VitaeCharm`.
- Browser spot-check (dev server :3000): PDP renders; tier selector + subscribe/one-time
  toggle (`#ot-s-toggle`) drive correct live prices (t1 sub $32 → t3 sub $75 → t3 one-time $114).
- `useCampaignStore.getState()` returned 10 packages with live prices (campaign active).
- Page-kit build (`campaign-build`): **3 pages built** to spec routes; `_site/vitaecharm/`
  emits config.js (correct key), SDK loader, clone-adapter.js, and CSS.

### Friction / manual steps
- `npm run build` **fails at `build:css`**: `tailwindcss` CLI not installed locally.
  Workaround: ran `campaign-build` directly (compiled `landing/tailwind.css` is committed,
  so static output is intact). **Fix:** add `tailwindcss` as a devDependency, or only run
  `build:css` when landing Tailwind sources change.

### Open risks / blockers
1. **CORS/allowlist gate (environment, not wiring):** campaign-retrieve (GET) succeeds, but
   cart-sync `calculateSummary` (POST) fails with `Failed to fetch` from `localhost:3000`.
   `localhost:3000` is not in the campaign's `allowed_domains`. **Dynamic cart totals,
   checkout totals, offer repricing, and receipt line items are NOT verified locally.**
   Resolve by allowlisting the dev origin OR verifying on the deployed/allowlisted domain (QA stage).
2. **Public route is `/vitaecharm/body-oil/`, not `/body-oil/`** (spec `public_route_slug: body-oil`).
   Expected per the "repurpose vitaecharm in place" decision; confirm intended URL shape before launch.
3. **"GET25" auto-applied discount banner** renders on the PDP, but the spec declares no
   `promo_codes`. Confirm `GET25` is a real configured code or intended copy (polish/QA).
4. **Tracking off** (gtm_id/fb_pixel_id ""), matching spec `not_configured`. Enable only if launch needs it.

### Source/import risks
- PDP is a Shopify **PageFly clone** (`base-clone.html` + `clone-adapter.js`) with runtime JS
  stripped and re-wired to the SDK. Treat the clone adapter as the commerce surface; it is
  NOT a stock shop-single-step starter PDP. No standard `data-next-bundle-selector` hooks —
  tier/mode selection is adapter-driven (`#pr-*` anchors + `#ot-s-toggle`).
- No SDK lint scripts in this repo (`lint:sdk*` absent); lint gate not run.

## Stage: Campaign Polish — COMPLETED

Source authority: the PDP is a 1:1 Shopify PageFly clone (no separate mockup to diff),
so polish was a self-consistency + responsive + copy/data review against the spec.
**No code patches were required** — the build renders the clone design faithfully and
all commerce surfaces are intact.

### Screenshots reviewed
- PDP `/vitaecharm/body-oil/` — desktop (1440) + mobile (390): hero, rating, gallery,
  benefit cards, tier cards (Buy1 / Buy2 Get1 FREE / Buy3 Get2 FREE) all render clean; no drift.
- Checkout `/vitaecharm/checkout/` — desktop (1440) + mobile (390): header, social proof,
  trust badges, Apple Pay express mount, contact + shipping forms (Country/Name/Address+
  autocomplete/Apt/City/State/ZIP), and a fully itemized order summary.

### Commerce smoke (client-side) — PASS
Checkout order summary computed correctly from live package prices + offers:
- Line items: Buy 3 Body Oil Sub $75; Mitt $9→$0, Sleep Mask $30→$0, Nail Oil $19→$0,
  Collagen $12→$0 (FREE offers refs 2/4/5/6 apply).
- Subtotal $145 − $70 free-gift discounts + $3.95 shipping = **Grand Total $78.95** ("48% off").
- Totals are SDK-bound (`data-next-display="cart.subtotal"/"cart.total"`), not hardcoded literals.

### Fixed
- none (faithful render; no visual/responsive drift)

### Surfaced for user/QA decision (preserved, not auto-changed)
- [copy/data mismatch + source/import warning] PDP `body-oil.html`: static cloned top-bar
  "Your Discount Code Has Been Applied **GET25**" (links to `#pricing_tables`). Decorative
  PageFly chrome, **not wired to any SDK coupon**; spec declares no promo_codes. Confirm intent
  or remove. Preserved per repo policy (don't auto-strip marketing claims).
- [minor] Checkout order summary: 4 product rows visible while subtotal implies 5 items
  (Collagen in discount list). Math is consistent ($145); confirm line-item rendering in QA.

### Remaining intentional divergences
- PDP commerce is adapter-driven (`#pr-*` anchors + `#ot-s-toggle`), not stock
  `data-next-bundle-selector` hooks — required because it's a re-wired PageFly clone.

### Runtime risks / verification blocks
- Server-authoritative `calculateSummary` (POST) is CORS-blocked from `localhost:3000`
  (origin not in `allowed_domains`). Client-side offer/total math verified; **final
  server-validated totals + order creation are NOT verified locally** → QA on deployed/allowlisted domain.
- Receipt not rendered locally (needs order context); item-template containers preserved (verified at build).

### Verification
- build: PASS (`campaign-build`; `npm run build` blocked at `build:css` — tailwindcss not installed)
- SDK lint: not available (no `lint:sdk*` scripts in this repo)
- screenshots: PDP desktop+mobile, checkout desktop+mobile
- commerce smoke: PASS client-side; server-validation blocked (CORS) → QA

## Next owner
`$next-campaigns-qa` from map_id `body-oil-y856` against a deployed/allowlisted base URL —
clear the cart-sync/server-total/order-creation gate and confirm checkout→receipt.
