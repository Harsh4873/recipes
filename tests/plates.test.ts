import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STARTER_RECIPES } from '../src/catalog';
import { plateForRecipe } from '../src/plates';

describe('meal photos', () => {
  it('pairs every recipe with a file that is actually in public/plates', () => {
    const used = new Set<string>();
    for (const recipe of STARTER_RECIPES) {
      const entry = plateForRecipe(recipe);
      expect(entry.file.endsWith('.jpg'), recipe.title).toBe(true);
      expect(entry.artist.length, recipe.title).toBeGreaterThan(1);
      expect(entry.license.length, recipe.title).toBeGreaterThan(1);
      expect(entry.source, recipe.title).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(existsSync(path.join(process.cwd(), 'public/plates', entry.file)), entry.file).toBe(true);
      used.add(entry.id);
    }
    expect(used.size).toBeGreaterThanOrEqual(18);
  });

  it('picks a plate that matches the dish, not a random gradient stand-in', () => {
    const byTitle = (title: string) => plateForRecipe(STARTER_RECIPES.find((recipe) => recipe.title === title)!);
    expect(byTitle('Paneer tikka rice bowl').id).toBe('tikka');
    expect(byTitle('Rajma chawal').id).toBe('rajma');
    expect(byTitle('Black bean burger pita plate').id).toBe('burger');
    expect(byTitle('Peanut tofu noodle bowl').id).toBe('noodles');
    expect(byTitle('Paneer tomato naan pizza').id).toBe('pizza');
    expect(byTitle('Peanut chickpea stew with rice').id).toBe('rice-beans');
    expect(byTitle('Spicy tofu bibimbap-style bowl').id).toBe('bibimbap');
    expect(byTitle('Tofu vegetable biryani with raita').id).toBe('biryani');
    expect(byTitle('Mujaddara-style rice and lentils').id).toBe('dal');
    expect(byTitle('Ginger soy tempeh rice bowl').id).not.toBe('thai');
    expect(byTitle('Masala egg lunch tacos').id).toBe('tacos');
    expect(byTitle('Japanese-style tofu potato curry').id).toBe('potatoes');
    expect(byTitle('Paneer tomato rice bake').id).toBe('tikka');
    expect(byTitle('Soy ginger tofu noodle soup').id).toBe('noodles');
  });
});
