import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STARTER_RECIPES } from '../src/catalog';
import { createEmptyState } from '../src/model';
import { buildRecipesStorageEnvelope, parseRecipesStorageValue } from '../src/store';
import App from '../src/App';

const mocked = vi.hoisted(() => ({ state: undefined as unknown }));
vi.mock('../src/store', async importOriginal => ({
  ...await importOriginal<typeof import('../src/store')>(),
  useRecipesStore: () => ({ hydrated: true, state: mocked.state }),
}));
vi.mock('../src/useRecipesSync', () => ({
  useRecipesSync: () => ({ status: 'off', user: null }),
}));

afterEach(() => vi.unstubAllGlobals());

function importAndRender(hash: string, useCatalogId = false) {
  const recipe = {
    ...STARTER_RECIPES[0],
    id: useCatalogId ? STARTER_RECIPES[0].id : 'manual-dinner',
    title: 'Imported vegetarian dinner',
    description: 'Saved recipe from a backup.',
    origin: 'manual' as const,
    steps: ['Cook the saved ingredients.'],
  };
  const state = { ...createEmptyState('2026-10-01T12:00:00.000Z', 'test-device'), recipes: [recipe] };
  const imported = parseRecipesStorageValue(JSON.parse(JSON.stringify(buildRecipesStorageEnvelope(state)))).state;
  mocked.state = imported;
  vi.stubGlobal('window', { location: { hash } });
  return { html: renderToStaticMarkup(<App />), imported };
}

describe('saved recipe views', () => {
  it('shows a valid imported noncatalog recipe in Saved and preserves it on export', () => {
    const { html, imported } = importAndRender('#/saved');
    expect(html).toContain('Imported vegetarian dinner');
    expect(html).toContain('1 saved meal');
    const exported = parseRecipesStorageValue(JSON.parse(JSON.stringify(buildRecipesStorageEnvelope(imported)))).state;
    expect(exported.recipes).toEqual(imported.recipes);
  });

  it('opens an imported noncatalog recipe with its stored method and ingredients', () => {
    const { html } = importAndRender('#/recipe/manual-dinner');
    expect(html).toContain('Imported vegetarian dinner');
    expect(html).toContain('Cook the saved ingredients.');
    expect(html).toContain(STARTER_RECIPES[0].ingredients[0].amountLabel);
  });

  it('uses the saved recipe snapshot when its ID matches a catalog recipe', () => {
    const { html } = importAndRender(`#/recipe/${STARTER_RECIPES[0].id}`, true);
    expect(html).toContain('Imported vegetarian dinner');
    expect(html).toContain('Cook the saved ingredients.');
  });

  it('still opens unsaved catalog recipes', () => {
    const recipe = STARTER_RECIPES[1];
    const { html } = importAndRender(`#/recipe/${recipe.id}`);
    expect(html).toContain(recipe.title);
    expect(html).not.toContain('Imported vegetarian dinner');
  });
});
