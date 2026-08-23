import { describe, expect, it } from 'vitest';
import { GROCERY_GUIDES, groceryGuideForProductId, retailerLinks } from '../src/grocery';

const APPROVED_RETAILER_HOSTS = new Set([
  'www.heb.com',
  'www.instacart.com',
  'www.walmart.com',
]);

const FLAVOR_GUIDE_IDS = [
  'starter:curry-powder',
  'starter:garam-masala',
  'starter:taco-seasoning',
  'starter:italian-seasoning',
  'starter:shawarma-seasoning',
  'starter:cajun-seasoning',
  'starter:berbere-seasoning',
  'starter:ras-el-hanout',
  'starter:jerk-seasoning',
  'starter:smoked-paprika',
  'starter:hot-sauce',
  'starter:lemon',
] as const;

const COOKED_QUANTITY_GUIDE_IDS = [
  'starter:chickpeas',
  'starter:black-beans',
  'starter:kidney-beans',
  'starter:pinto-beans',
  'starter:lentils',
  'starter:red-lentils',
  'starter:chana-dal',
  'starter:urad-dal',
  'starter:basmati-rice',
  'starter:brown-rice',
  'starter:quinoa',
  'starter:pasta',
] as const;

describe('grocery guides', () => {
  it('provides at least 50 unique product guides', () => {
    expect(GROCERY_GUIDES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GROCERY_GUIDES.map((guide) => guide.id)).size).toBe(GROCERY_GUIDES.length);
  });

  it('keeps every guide complete, dated, and free of numbered aisles', () => {
    for (const guide of GROCERY_GUIDES) {
      expect(guide.id).toMatch(/^starter:[a-z0-9-]+$/);
      expect(guide.name.trim()).not.toBe('');
      expect(Array.isArray(guide.aliases)).toBe(true);
      expect(guide.explanation.trim()).not.toBe('');
      expect(guide.typicalSection.trim()).not.toBe('');
      expect(guide.typicalSection).not.toMatch(/\baisle\s*\d/i);
      expect(guide.packageGuidance.trim()).not.toBe('');
      expect(guide.storage.trim()).not.toBe('');
      expect(guide.dietaryCheck.trim()).not.toBe('');
      expect(guide.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      for (const pick of [guide.budget, guide.bestForDish]) {
        expect(pick.label.trim()).not.toBe('');
        expect(pick.searchQuery.trim()).not.toBe('');
        expect(pick.reason.trim()).not.toBe('');
      }
    }
  });

  it('does not store retailer price, rating, inventory, or numbered-aisle claims', () => {
    const serialized = JSON.stringify(GROCERY_GUIDES);
    expect(serialized).not.toMatch(/\$\s*\d/);
    expect(serialized).not.toMatch(/\b(?:cheapest|lowest price|live price|current price|in stock|out of stock)\b/i);
    expect(serialized).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:stars?|rating)\b/i);
    expect(serialized).not.toMatch(/\baisle\s*\d/i);
  });

  it('looks guides up by exact product id', () => {
    expect(groceryGuideForProductId('starter:tofu-firm')?.name).toBe('Extra-firm tofu');
    expect(groceryGuideForProductId('starter:tomato-paste')?.typicalSection).toContain('Canned tomatoes');
    expect(groceryGuideForProductId('starter:not-real')).toBeUndefined();
  });

  it('covers every curated flavor staple by its exact product id', () => {
    for (const id of FLAVOR_GUIDE_IDS) {
      expect(groceryGuideForProductId(id), `missing grocery guide for ${id}`).toBeDefined();
    }
  });

  it('distinguishes cooked recipe quantities from packages to buy', () => {
    for (const id of COOKED_QUANTITY_GUIDE_IDS) {
      expect(groceryGuideForProductId(id)?.packageGuidance).toMatch(/recipe quantities (?:are|labeled) cooked|recipe quantities are cooked or prepared/i);
    }
  });

  it('makes canned kidney beans the quick default and preserves dry-bean safety steps', () => {
    const kidneyBeans = groceryGuideForProductId('starter:kidney-beans');
    expect(kidneyBeans?.budget.searchQuery).toMatch(/canned/i);
    expect(kidneyBeans?.bestForDish.searchQuery).toMatch(/canned/i);
    expect(kidneyBeans?.storage).toMatch(/soak at least 5 hours/i);
    expect(kidneyBeans?.storage).toMatch(/discard the soaking water/i);
    expect(kidneyBeans?.storage).toMatch(/boil in fresh water for at least 10 minutes/i);
    expect(kidneyBeans?.storage).toMatch(/cook fully until tender/i);
  });
});

describe('retailer links', () => {
  it('builds encoded HTTPS searches only on approved retailer hosts', () => {
    const links = retailerLinks('extra-firm tofu & ginger');

    for (const href of Object.values(links)) {
      const url = new URL(href);
      expect(url.protocol).toBe('https:');
      expect(APPROVED_RETAILER_HOSTS.has(url.hostname)).toBe(true);
      expect(href).not.toContain(' ');
      expect(href).toContain('extra-firm%20tofu%20%26%20ginger');
    }
  });

  it('trims the query without evaluating or fetching it', () => {
    const links = retailerLinks('  tomato paste  ');
    expect(links.heb).toBe('https://www.heb.com/search/?q=tomato%20paste');
    expect(links.instacart).toBe('https://www.instacart.com/store/s?k=tomato%20paste');
    expect(links.walmart).toBe('https://www.walmart.com/search?q=tomato%20paste');
  });

  it('keeps every flavor-pick search on an approved HTTPS retailer host', () => {
    for (const id of FLAVOR_GUIDE_IDS) {
      const guide = groceryGuideForProductId(id);
      expect(guide).toBeDefined();

      for (const pick of [guide!.budget, guide!.bestForDish]) {
        for (const href of Object.values(retailerLinks(pick.searchQuery))) {
          const url = new URL(href);
          expect(url.protocol).toBe('https:');
          expect(APPROVED_RETAILER_HOSTS.has(url.hostname)).toBe(true);
        }
      }
    }
  });
});
