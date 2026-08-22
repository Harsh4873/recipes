import { describe, expect, it } from 'vitest';
import { STARTER_PRODUCTS, STARTER_RECIPES } from '../src/catalog';
import { classifyVegetarian, containsBlockedDietTerm, productIsAllowed } from '../src/diet';

describe('strict vegetarian gate', () => {
  it('blocks meat, fish, stock, gelatin, lard, and tallow while allowing eggs', () => {
    for (const name of ['chicken broth', 'salmon filet', 'beef stock', 'pork gelatin', 'beans with lard', 'tallow fries']) {
      expect(classifyVegetarian({ name }).status).toBe('blocked');
    }
    expect(classifyVegetarian({ name: 'whole eggs', curated: true }).status).toBe('allowed');
  });

  it('blocks direct poultry, fish, shellfish, and bone-broth terms including common variants', () => {
    const blocked = [
      'poultry seasoning with poultry fat',
      'bone broths',
      'bonito flakes',
      'cod fillets',
      'smoked haddock',
      'tilapia tacos',
      'chopped clams',
      'sea scallops',
      'fried squid',
      'baby octopus',
      'octopi salad',
      'mussels in sauce',
      'crawfish boil',
      'smoked brisket',
      'pancetta pasta',
      'bologna sandwich',
      'pastrami rye',
      'mortadella roll',
      'barbecue ribs',
      'hot dog buns with hot dogs',
      'surimi sticks',
      'caviar toast',
    ];
    for (const name of blocked) {
      expect(classifyVegetarian({ name }).status, name).toBe('blocked');
      expect(containsBlockedDietTerm(name), name).toBe(true);
    }
  });

  it('normalizes punctuation before applying the strict blocker taxonomy', () => {
    for (const name of ['bone-broth', 'chicken_stock', 'fish–sauce', 'shellfish/bouillon', 'pork.gelatin']) {
      expect(classifyVegetarian({ name, ownerApproved: true }).status, name).toBe('blocked');
      expect(containsBlockedDietTerm(name), name).toBe(true);
    }
  });

  it('allows unambiguous ovo-lacto foods with animal words in their names', () => {
    for (const name of ['goat cheese', "goat's milk yogurt", 'goat-milk', 'oyster mushrooms', 'oyster-mushroom', 'hen eggs', 'duck-eggs', 'quail’s egg']) {
      expect(classifyVegetarian({ name, curated: true }).status, name).toBe('allowed');
      expect(containsBlockedDietTerm(name), name).toBe(false);
    }

    for (const name of ['goat curry', 'goat broth', 'fried oysters', 'oyster sauce']) {
      expect(classifyVegetarian({ name, curated: true }).status, name).toBe('blocked');
      expect(containsBlockedDietTerm(name), name).toBe(true);
    }
  });

  it('uses provider taxonomy while keeping non-vegan egg and dairy products eligible', () => {
    expect(classifyVegetarian({
      name: 'Whole duck eggs',
      labels: ['en:vegetarian'],
      analysisTags: ['en:non-vegan'],
    }).status).toBe('allowed');
    expect(classifyVegetarian({
      name: 'Vegetable dumplings',
      labels: ['en:non-vegetarian'],
      ownerApproved: true,
    }).status).toBe('blocked');
    expect(classifyVegetarian({
      name: 'Vegetable dumplings',
      labels: ['en:vegan'],
      analysisTags: ['en:vegetarian-status-unknown'],
    }).status).toBe('review');
  });

  it('allows explicit analogs only with strong provider-backed evidence', () => {
    const analogEligibility = classifyVegetarian({
      name: 'Plant-based chicken nuggets',
      ingredientsText: 'soy protein, wheat flour, canola oil',
      analysisTags: ['en:vegan'],
    });
    expect(analogEligibility).toMatchObject({ status: 'allowed', evidence: 'provider-label' });
    expect(productIsAllowed({
      name: 'Plant-based chicken nuggets',
      ingredientsText: 'soy protein, wheat flour, canola oil',
      aliases: ['vegan chicken nuggets'],
      categories: ['plant-based meat alternatives'],
      eligibility: analogEligibility,
    })).toBe(true);
    expect(classifyVegetarian({
      name: 'Chicken nuggets',
      ingredientsText: 'soy protein, wheat flour, canola oil',
      labels: ['en:certified-vegan'],
    })).toMatchObject({ status: 'allowed', evidence: 'provider-label' });

    for (const input of [
      { name: 'Plant-based chicken nuggets', ingredientsText: 'soy protein, wheat flour', ownerApproved: true },
      { name: 'Plant-based chicken nuggets', ingredientsText: 'soy protein, wheat flour', labels: ['en:plant-based'] },
      { name: 'Plant-based chicken nuggets', ingredientsText: 'soy protein, chicken stock', labels: ['en:certified-vegan'] },
      { name: 'Vegan fish sticks', ingredientsText: 'pea protein', labels: ['en:non-vegetarian', 'en:vegan'] },
    ]) {
      expect(classifyVegetarian(input).status, input.name).toBe('blocked');
    }
  });

  it('never lets owner approval or curation override an explicit blocked ingredient', () => {
    expect(classifyVegetarian({
      name: 'vegetable dumplings',
      ingredientsText: 'cabbage, bonito flakes, bone broth',
      ownerApproved: true,
    }).status).toBe('blocked');
    expect(classifyVegetarian({
      name: 'paneer bowl with chicken stock',
      curated: true,
      ownerApproved: true,
    }).status).toBe('blocked');
  });

  it('fails closed when provider evidence is missing', () => {
    expect(classifyVegetarian({ name: 'mystery frozen entrée' }).status).toBe('review');
    expect(classifyVegetarian({ name: 'vegetable wrap', ingredientsText: 'wheat, vegetables, natural flavors' }).status).toBe('review');
  });

  it('keeps every bundled product and recipe inside the product boundary', () => {
    expect(STARTER_PRODUCTS.length).toBeGreaterThan(30);
    for (const product of STARTER_PRODUCTS) {
      expect(product.eligibility.status, product.name).toBe('allowed');
      expect(containsBlockedDietTerm([product.name, product.ingredientsText].filter(Boolean).join(' ')), product.name).toBe(false);
    }
    for (const recipe of STARTER_RECIPES) {
      expect(recipe.dietStatus, recipe.title).toBe('allowed');
      expect(recipe.ingredients.every((ingredient) => ingredient.snapshot?.eligibility.status === 'allowed'), recipe.title).toBe(true);
    }
  });
});
