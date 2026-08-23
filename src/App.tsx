import {
  ArrowLeft,
  ArrowUpDown,
  Bookmark,
  BookmarkCheck,
  Check,
  ChefHat,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Egg,
  ExternalLink,
  Flame,
  Gauge,
  Leaf,
  ListFilter,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  PackageCheck,
  Search,
  Settings2,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
  Upload,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { STARTER_PRODUCTS, STARTER_RECIPES } from './catalog';
import { containsBlockedDietTerm } from './diet';
import {
  GROCERY_GUIDES,
  groceryGuideForProductId,
  retailerLinks,
  type GroceryGuide,
} from './grocery';
import type { Recipe, RecipesSettings, ShoppingItem } from './model';
import {
  filterAndSortRecipes,
  type RecipeSearchOptions,
  type RecipeSort,
} from './recipe-search';
import { useRecipesStore } from './store';
import { useRecipesSync } from './useRecipesSync';

type ListView = 'browse' | 'saved' | 'grocery' | 'settings';
type Route = { readonly view: ListView } | { readonly view: 'recipe'; readonly recipeId: string };

interface ViewDefinition {
  readonly id: ListView;
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly icon: LucideIcon;
}

const VIEWS: readonly ViewDefinition[] = [
  { id: 'browse', label: 'Browse', eyebrow: '100 substantial meals', title: 'Find your next meal', icon: ChefHat },
  { id: 'saved', label: 'Saved', eyebrow: 'Your short list', title: 'Meals worth repeating', icon: Bookmark },
  { id: 'grocery', label: 'Grocery', eyebrow: 'Recipe → store', title: 'Know exactly what to buy', icon: ShoppingBasket },
  { id: 'settings', label: 'Settings', eyebrow: 'Private + local-first', title: 'Preferences and sync', icon: Settings2 },
];

const PROTEIN_FILTERS = ['Paneer', 'Tofu', 'Beans', 'Lentils', 'Eggs', 'Tempeh', 'Seitan', 'Cheese'] as const;
const CALORIE_BANDS = [
  { id: 'all', label: 'All substantial meals' },
  { id: '800-899', label: '800–899 kcal' },
  { id: '900-1099', label: '900–1,099 kcal' },
  { id: '1100+', label: '1,100+ kcal' },
] as const;

function routeFromHash(): Route {
  const [view = 'browse', encodedId] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (view === 'recipe' && encodedId) {
    try {
      return { view: 'recipe', recipeId: decodeURIComponent(encodedId) };
    } catch {
      return { view: 'browse' };
    }
  }
  return VIEWS.some((candidate) => candidate.id === view)
    ? { view: view as ListView }
    : { view: 'browse' };
}

function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(routeFromHash);
  useEffect(() => {
    const update = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const navigate = useCallback((next: Route) => {
    const hash = next.view === 'recipe'
      ? `/recipe/${encodeURIComponent(next.recipeId)}`
      : `/${next.view}`;
    if (window.location.hash !== `#${hash}`) window.location.hash = hash;
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return [route, navigate];
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function totalMinutes(recipe: Recipe): number {
  return recipe.prepMinutes + recipe.cookMinutes;
}

interface GroceryRow {
  readonly key: string;
  readonly name: string;
  readonly amountLabel?: string;
  readonly checked: boolean;
  readonly createdAt: string;
  readonly items: readonly ShoppingItem[];
}

function consolidateShoppingItems(items: readonly ShoppingItem[]): GroceryRow[] {
  const grouped = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const key = item.name.trim().toLocaleLowerCase();
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return [...grouped.entries()].map(([key, entries]) => {
    const remaining = entries.filter((item) => !item.checked);
    const displayedEntries = remaining.length > 0 ? remaining : entries;
    const labels = displayedEntries.map((item) => item.amountLabel ?? 'amount as needed');
    const sameAmount = new Set(labels).size === 1;
    const amountLabel = sameAmount && displayedEntries.length > 1
        ? `${displayedEntries.length} recipes · ${labels[0]} each`
        : labels.join(' + ');
    return {
      key,
      name: entries[0].name,
      ...(amountLabel ? { amountLabel } : {}),
      checked: remaining.length === 0,
      createdAt: entries.reduce((earliest, item) => item.createdAt < earliest ? item.createdAt : earliest, entries[0].createdAt),
      items: entries,
    };
  });
}

function recipeTone(recipe: Recipe): string {
  const value = `${recipe.cuisine} ${recipe.tags.join(' ')}`.toLowerCase();
  if (/indian|south asian/.test(value)) return 'saffron';
  if (/mexican|tex|taco/.test(value)) return 'tomato';
  if (/asian|thai|korean|japanese|chinese/.test(value)) return 'jade';
  if (/mediterranean|middle eastern|greek/.test(value)) return 'olive';
  if (/italian|pasta|european/.test(value)) return 'berry';
  return 'forest';
}

function MacroStrip({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const nutrition = recipe.nutritionPerServing;
  return (
    <div className={`macro-strip${compact ? ' macro-strip--compact' : ''}`} aria-label="Nutrition per substantial serving">
      <div className="macro-stat macro-stat--calories"><span>Calories</span><strong>{formatNumber(nutrition.calories)}</strong><small>kcal</small></div>
      <div className="macro-stat macro-stat--protein"><span>Protein</span><strong>{formatNumber(nutrition.proteinG, 1)}</strong><small>g</small></div>
      <div className="macro-stat macro-stat--carbs"><span>Carbs</span><strong>{formatNumber(nutrition.carbsG, 1)}</strong><small>g</small></div>
      <div className="macro-stat macro-stat--fat"><span>Fat</span><strong>{formatNumber(nutrition.fatG, 1)}</strong><small>g</small></div>
    </div>
  );
}

function SaveButton({ saved, onClick, label = true }: { saved: boolean; onClick: () => void; label?: boolean }) {
  return (
    <button className={`save-button${saved ? ' is-saved' : ''}`} type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} aria-pressed={saved} aria-label={saved ? 'Remove from saved recipes' : 'Save recipe'}>
      {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
      {label && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}

function RecipeCard({ recipe, saved, onOpen, onToggleSave }: { recipe: Recipe; saved: boolean; onOpen: () => void; onToggleSave: () => void }) {
  return (
    <article className="meal-card" data-tone={recipeTone(recipe)}>
      <div className="meal-card__art">
        <span className="meal-card__cuisine">{recipe.cuisine}</span>
        <span className="meal-card__time"><Clock3 aria-hidden="true" /> {totalMinutes(recipe)} min</span>
        <span className="meal-card__number">{formatNumber(recipe.nutritionPerServing.calories)}</span>
        <small>kcal · one substantial serving</small>
      </div>
      <div className="meal-card__body">
        <div className="meal-card__heading"><div><h3>{recipe.title}</h3><p>{recipe.description}</p></div></div>
        <div className="meal-card__macros" aria-label="Macros"><span><b>{formatNumber(recipe.nutritionPerServing.proteinG)}</b>g protein</span><span><b>{formatNumber(recipe.nutritionPerServing.carbsG)}</b>g carbs</span><span><b>{formatNumber(recipe.nutritionPerServing.fatG)}</b>g fat</span></div>
        <div className="tag-row">{recipe.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="meal-card__footer"><span>{recipe.ingredients.length} ingredients</span><span>View recipe <ChevronRight aria-hidden="true" /></span></div>
      </div>
      <button className="meal-card__open" type="button" onClick={onOpen} aria-label={`Open ${recipe.title}: ${formatNumber(recipe.nutritionPerServing.calories)} calories, ${formatNumber(recipe.nutritionPerServing.proteinG)} grams protein, ${totalMinutes(recipe)} minutes`} />
      <SaveButton saved={saved} onClick={onToggleSave} label={false} />
    </article>
  );
}

function Dialog({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const appRoot = document.getElementById('root');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const rootWasInert = appRoot?.inert ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    const focusable = () => dialog ? [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')] : [];
    const focusFirst = () => (dialog?.querySelector<HTMLElement>('[data-dialog-initial-focus]') ?? dialog)?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog?.focus(); return; }
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
    };
    document.body.style.overflow = 'hidden';
    if (appRoot) { appRoot.inert = true; appRoot.setAttribute('aria-hidden', 'true'); }
    const frame = window.requestAnimationFrame(focusFirst);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
      if (appRoot) {
        appRoot.inert = rootWasInert;
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="dialog-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="buying-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="buying-dialog__header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button></header>
        <div className="buying-dialog__body">{children}</div>
      </section>
    </div>, document.body,
  );
}

function BuyingGuide({ guide, amountLabel, onClose }: { guide: GroceryGuide; amountLabel?: string; onClose: () => void }) {
  const budgetLinks = retailerLinks(guide.budget.searchQuery);
  const bestLinks = retailerLinks(guide.bestForDish.searchQuery);
  return (
    <Dialog title={guide.name} eyebrow="Ingredient buying guide" onClose={onClose}>
      <div className="guide-intro"><span className="guide-intro__icon"><PackageCheck aria-hidden="true" /></span><div><p>{guide.explanation}</p>{amountLabel && <strong>Recipe uses: {amountLabel}</strong>}</div></div>
      <dl className="guide-facts"><div><dt><MapPin aria-hidden="true" /> Find it around</dt><dd>{guide.typicalSection}</dd></div><div><dt><ShoppingBasket aria-hidden="true" /> Buy this much</dt><dd>{guide.packageGuidance}</dd></div></dl>
      <section className="pick-card pick-card--budget"><span className="pick-card__icon"><WalletCards aria-hidden="true" /></span><div><span className="eyebrow">Budget default</span><h3>{guide.budget.label}</h3><p>{guide.budget.reason}</p><div className="retailer-row"><a href={budgetLinks.heb} target="_blank" rel="noreferrer">Find at H‑E‑B <ExternalLink aria-hidden="true" /></a><a href={budgetLinks.walmart} target="_blank" rel="noreferrer">Compare Walmart <ExternalLink aria-hidden="true" /></a></div></div></section>
      <section className="pick-card pick-card--best"><span className="pick-card__icon"><Sparkles aria-hidden="true" /></span><div><span className="eyebrow">Preferred cooking format</span><h3>{guide.bestForDish.label}</h3><p>{guide.bestForDish.reason}</p><div className="retailer-row"><a href={bestLinks.heb} target="_blank" rel="noreferrer">Find at H‑E‑B <ExternalLink aria-hidden="true" /></a><a href={bestLinks.instacart} target="_blank" rel="noreferrer">Compare nearby <ExternalLink aria-hidden="true" /></a></div></div></section>
      <div className="guide-note"><strong>Store it</strong><p>{guide.storage}</p></div>
      {guide.dietaryCheck && <div className="notice notice--warning"><CircleAlert aria-hidden="true" /><div><strong>Vegetarian label check</strong><span>{guide.dietaryCheck}</span></div></div>}
      <p className="live-price-note">Prices, stock, and store location open at the retailer when available. “Budget default” describes the usually economical format, not a guaranteed current lowest price.</p>
    </Dialog>
  );
}

function SignOutStatus() {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const root = document.getElementById('root');
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (root) { root.inert = true; root.setAttribute('aria-hidden', 'true'); }
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; if (root) { root.inert = false; root.removeAttribute('aria-hidden'); } if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="signout-scrim" role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby={titleId} aria-describedby={descriptionId}><div ref={panelRef} tabIndex={-1}><LoaderCircle className="spin" aria-hidden="true" /><strong id={titleId}>Finishing private sync…</strong><span id={descriptionId}>Keep Recipes open while the latest confirmed copy is protected.</span></div></div>, document.body);
}

function RecipeDetail({ recipe, saved, onBack, onToggleSave, onAddToList, onOpenGuide }: { recipe: Recipe; saved: boolean; onBack: () => void; onToggleSave: () => void; onAddToList: () => void; onOpenGuide: (guide: GroceryGuide, amount: string) => void }) {
  const nutrition = recipe.nutritionPerServing;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [recipe.id]);
  return (
    <div className="recipe-page">
      <button className="back-button" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to recipes</button>
      <section className="recipe-hero" data-tone={recipeTone(recipe)}>
        <div className="recipe-hero__copy"><div className="recipe-hero__meta"><span>{recipe.cuisine}</span><span><Clock3 aria-hidden="true" /> {recipe.prepMinutes} min prep · {recipe.cookMinutes} min cook</span></div><h1 ref={titleRef} tabIndex={-1}>{recipe.title}</h1><p>{recipe.description}</p><div className="tag-row tag-row--hero">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="recipe-hero__actions"><button className="primary-button" type="button" onClick={onAddToList}><ShoppingBasket aria-hidden="true" /> Get all ingredients</button><SaveButton saved={saved} onClick={onToggleSave} /></div></div>
        <div className="recipe-hero__nutrition"><span className="eyebrow">One substantial serving</span><MacroStrip recipe={recipe} /><div className="nutrition-secondary"><span><b>{formatNumber(nutrition.fiberG, 1)}g</b> fiber</span><span><b>{formatNumber(nutrition.saturatedFatG, 1)}g</b> saturated fat</span><span><b>{formatNumber(nutrition.sodiumMg)}</b>mg sodium</span></div></div>
      </section>
      <div className="recipe-content-grid">
        <section className="recipe-section ingredients-section"><div className="section-heading"><div><span className="eyebrow">Exact amounts</span><h2>Ingredients</h2></div><span>{recipe.ingredients.length} items</span></div><div className="ingredient-stack">{recipe.ingredients.map((ingredient, index) => { const guide = ingredient.productId ? groceryGuideForProductId(ingredient.productId) : undefined; return <article className="ingredient-row" key={`${recipe.id}-${ingredient.id}-${index}`}><span className="ingredient-row__number">{String(index + 1).padStart(2, '0')}</span><div><h3>{ingredient.name}</h3><p>{ingredient.amountLabel}{ingredient.optional ? ' · optional' : ''}</p></div>{guide && <button type="button" onClick={() => onOpenGuide(guide, ingredient.amountLabel)}>How to buy <ChevronRight aria-hidden="true" /></button>}</article>; })}</div><button className="primary-button primary-button--full" type="button" onClick={onAddToList}><ShoppingBasket aria-hidden="true" /> Add this recipe to Grocery</button></section>
        <section className="recipe-section method-section"><div className="section-heading"><div><span className="eyebrow">Cook in order</span><h2>Method</h2></div><span>{totalMinutes(recipe)} minutes</span></div><ol className="method-list">{recipe.steps.map((step, index) => <li key={`${recipe.id}-step-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol><div className="nutrition-note"><Gauge aria-hidden="true" /><p><strong>Macro math stays auditable.</strong> Totals are calculated from the listed ingredient quantities and typical reference nutrition. Packaged products vary, so the current label wins.</p></div></section>
      </div>
      <div className="recipe-mobile-actions"><button className="primary-button" type="button" onClick={onAddToList}><ShoppingBasket aria-hidden="true" /> Get ingredients</button><SaveButton saved={saved} onClick={onToggleSave} label={false} /></div>
    </div>
  );
}

function App() {
  const [route, navigate] = useHashRoute();
  const store = useRecipesStore();
  const sync = useRecipesSync(store);
  const state = store.state;
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [protein, setProtein] = useState('All');
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>();
  const [calorieBand, setCalorieBand] = useState<'all' | '800-899' | '900-1099' | '1100+'>('all');
  const [minProteinG, setMinProteinG] = useState<number | undefined>();
  const [sort, setSort] = useState<RecipeSort>('recommended');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeGuide, setActiveGuide] = useState<{ guide: GroceryGuide; amount?: string }>();
  const [toast, setToast] = useState<string>();
  const [shoppingDraft, setShoppingDraft] = useState('');
  const returnViewRef = useRef<ListView>('browse');
  const filterDrawerId = useId();

  const showToast = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast((current) => current === message ? undefined : current), 3000); }, []);
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.settings.theme; }, [state?.settings.theme]);

  const cuisines = useMemo(() => [...new Set(STARTER_RECIPES.map((recipe) => recipe.cuisine))].sort(), []);
  const savedIds = useMemo(() => new Set(state?.recipes.map((recipe) => recipe.id) ?? []), [state?.recipes]);
  const savedRecipes = useMemo(() => STARTER_RECIPES.filter((recipe) => savedIds.has(recipe.id)), [savedIds]);
  const shoppingRows = useMemo(() => consolidateShoppingItems(state?.shopping ?? []), [state?.shopping]);
  const searchOptions = useMemo<RecipeSearchOptions>(() => ({ query, cuisines: cuisine === 'All' ? [] : [cuisine], proteins: protein === 'All' ? [] : [protein], ...(maxMinutes ? { maxMinutes } : {}), ...(calorieBand === 'all' ? {} : { calorieBand }), ...(minProteinG ? { minProteinG } : {}), sort }), [calorieBand, cuisine, maxMinutes, minProteinG, protein, query, sort]);
  const visibleRecipes = useMemo(() => filterAndSortRecipes(STARTER_RECIPES, searchOptions), [searchOptions]);
  const activeRecipe = route.view === 'recipe' ? STARTER_RECIPES.find((recipe) => recipe.id === route.recipeId) : undefined;

  const openRecipe = (recipe: Recipe, from: ListView) => { returnViewRef.current = from; navigate({ view: 'recipe', recipeId: recipe.id }); };
  const toggleSave = (recipe: Recipe) => { if (savedIds.has(recipe.id)) { store.deleteRecipe(recipe.id); showToast('Removed from Saved.'); } else { store.saveRecipe(recipe); showToast('Saved for later.'); } };
  const addRecipeToList = (recipe: Recipe) => { const added = store.addShoppingItems(recipe.ingredients.map((ingredient) => ({ name: ingredient.name, amountLabel: `${ingredient.amountLabel}${ingredient.optional ? ' · optional' : ''}`, recipeId: recipe.id }))); showToast(added.length ? `${added.length} ingredients added to Grocery.` : 'That recipe is already on your grocery list.'); };
  const copyGroceryList = async () => { const open = shoppingRows.filter((item) => !item.checked); const text = open.map((item) => `• ${item.name}${item.amountLabel ? ` — ${item.amountLabel}` : ''}`).join('\n'); if (!text) return showToast('Your grocery list is empty.'); try { await navigator.clipboard.writeText(text); showToast('Grocery list copied.'); } catch { showToast('This browser could not copy the list.'); } };
  const exportData = () => { try { const blob = new Blob([store.exportState()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `recipes-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); } catch (error) { showToast(error instanceof Error ? error.message : 'Could not export Recipes.'); } };
  const importData = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { store.importState(await file.text()); showToast('Recipes backup imported.'); } catch (error) { showToast(error instanceof Error ? error.message : 'That backup could not be imported.'); } };
  const resetLocalData = async () => { if (sync.user && sync.status !== 'synced') return showToast('Wait for confirmed sync—or export a backup—before clearing this device.'); if (!window.confirm('Clear saved recipes and grocery items only on this device?')) return; try { await store.clearLocalData(); if (sync.user) window.location.reload(); else showToast('Recipes was cleared on this device.'); } catch (error) { showToast(error instanceof Error ? error.message : 'Could not clear local data safely.'); } };

  if (!store.hydrated || !state) return <main className="loading-screen"><span className="brand-mark"><Leaf aria-hidden="true" /></span><LoaderCircle className="spin" aria-hidden="true" /><p>Opening the recipe book…</p></main>;

  const listView: ListView = route.view === 'recipe' ? returnViewRef.current : route.view;
  const currentView = VIEWS.find((view) => view.id === listView) ?? VIEWS[0];
  const openShoppingCount = shoppingRows.filter((item) => !item.checked).length;
  const syncLabel = sync.status === 'synced' ? 'Synced' : sync.status === 'syncing' ? 'Syncing' : sync.status === 'offline' ? 'Offline' : sync.status === 'action-needed' ? 'Action needed' : 'On this device';
  const groupedShopping = shoppingRows.reduce<Map<string, GroceryRow[]>>((groups, item) => { const product = STARTER_PRODUCTS.find((candidate) => candidate.name.toLocaleLowerCase() === item.name.toLocaleLowerCase()); const section = product ? groceryGuideForProductId(product.id)?.typicalSection ?? 'Other groceries' : 'Other groceries'; groups.set(section, [...(groups.get(section) ?? []), item]); return groups; }, new Map());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navigate({ view: 'browse' })} aria-label="Recipes home"><span className="brand-mark"><Leaf aria-hidden="true" /></span><span><strong>Recipes</strong><small>substantial vegetarian meals</small></span></button>
        <nav className="nav" aria-label="Primary navigation"><span className="nav__label">Recipe book</span>{VIEWS.map((item) => { const Icon = item.icon; const active = listView === item.id && route.view !== 'recipe'; return <button key={item.id} className={`nav__item${active ? ' is-active' : ''}`} type="button" onClick={() => navigate({ view: item.id })} aria-current={active ? 'page' : undefined}><Icon aria-hidden="true" /><span>{item.label}</span>{item.id === 'saved' && savedRecipes.length > 0 && <b>{savedRecipes.length}</b>}{item.id === 'grocery' && openShoppingCount > 0 && <b>{openShoppingCount}</b>}</button>; })}</nav>
        <div className="diet-lock"><span><Leaf aria-hidden="true" /></span><div><strong>Vegetarian locked</strong><small>Eggs + dairy allowed · no breakfast</small></div></div>
        <div className="sidebar__footer"><button className="sync-card" type="button" onClick={() => navigate({ view: 'settings' })}><span className={`sync-dot sync-dot--${sync.status}`} /><span><strong>{syncLabel}</strong><small>{sync.user ? 'Private Firebase vault' : 'Local-first favorites'}</small></span><ChevronRight aria-hidden="true" /></button></div>
      </aside>

      <main className="main">
        {route.view !== 'recipe' && <header className="topbar"><div><span className="eyebrow">{currentView.eyebrow}</span><h1>{currentView.title}</h1></div><div className="topbar__right"><span className="catalog-pill"><Leaf aria-hidden="true" /> Ovo-lacto vegetarian</span></div></header>}
        <div className={route.view === 'recipe' ? 'main__content main__content--recipe' : 'main__content'}>
          {route.view === 'recipe' && activeRecipe && <RecipeDetail recipe={activeRecipe} saved={savedIds.has(activeRecipe.id)} onBack={() => navigate({ view: returnViewRef.current })} onToggleSave={() => toggleSave(activeRecipe)} onAddToList={() => addRecipeToList(activeRecipe)} onOpenGuide={(guide, amount) => setActiveGuide({ guide, amount })} />}
          {route.view === 'recipe' && !activeRecipe && <div className="empty-state"><ChefHat aria-hidden="true" /><h2>That recipe moved</h2><p>Browse the current substantial-meal catalog instead.</p><button className="primary-button" type="button" onClick={() => navigate({ view: 'browse' })}>Browse recipes</button></div>}

          {route.view === 'browse' && <div className="page-stack">
            <section className="browse-hero"><div className="browse-hero__copy"><span className="hero-kicker"><Flame aria-hidden="true" /> Built for one serious meal</span><h2>{STARTER_RECIPES.length} vegetarian lunches and dinners.<br />Every one starts at 800 calories.</h2><p>Search a finished, curated meal; see calculated macros; then learn what every ingredient is and where to buy it.</p></div><div className="browse-hero__stats"><div><strong>{STARTER_RECIPES.length}</strong><span>complete recipes</span></div><div><strong>800+</strong><span>kcal each</span></div><div><strong>{GROCERY_GUIDES.length}</strong><span>buying guides</span></div></div><label className="hero-search"><span className="sr-only">Search recipes</span><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paneer, tofu, pasta, Thai, spicy…" autoComplete="off" /></label></section>
            <section className="filter-panel"><div className="filter-panel__top"><div><ListFilter aria-hidden="true" /><span><strong>{visibleRecipes.length}</strong> recipes match</span></div><div className="filter-panel__actions"><label className="sort-select"><ArrowUpDown aria-hidden="true" /><select value={sort} onChange={(event) => setSort(event.target.value as RecipeSort)} aria-label="Sort recipes"><option value="recommended">Recommended</option><option value="fastest">Fastest</option><option value="protein">Highest protein</option><option value="calories">Highest calories</option></select></label><button className={`filter-toggle${filtersOpen ? ' is-active' : ''}`} type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-controls={filterDrawerId}><SlidersHorizontal aria-hidden="true" /> Filters</button></div></div><div className="quick-chips"><button className={maxMinutes === undefined ? 'is-active' : ''} type="button" onClick={() => setMaxMinutes(undefined)} aria-pressed={maxMinutes === undefined}>Any time</button><button className={maxMinutes === 30 ? 'is-active' : ''} type="button" onClick={() => setMaxMinutes(30)} aria-pressed={maxMinutes === 30}>≤ 30 min</button><button className={maxMinutes === 45 ? 'is-active' : ''} type="button" onClick={() => setMaxMinutes(45)} aria-pressed={maxMinutes === 45}>≤ 45 min</button><button className={minProteinG === 40 ? 'is-active' : ''} type="button" onClick={() => setMinProteinG((value) => value === 40 ? undefined : 40)} aria-pressed={minProteinG === 40}>40g+ protein</button></div>{filtersOpen && <div className="filter-drawer" id={filterDrawerId}><label><span>Cuisine</span><select value={cuisine} onChange={(event) => setCuisine(event.target.value)}><option>All</option>{cuisines.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Main protein</span><select value={protein} onChange={(event) => setProtein(event.target.value)}><option>All</option>{PROTEIN_FILTERS.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Calories</span><select value={calorieBand} onChange={(event) => setCalorieBand(event.target.value as typeof calorieBand)}>{CALORIE_BANDS.map((band) => <option value={band.id} key={band.id}>{band.label}</option>)}</select></label><button type="button" onClick={() => { setCuisine('All'); setProtein('All'); setMaxMinutes(undefined); setCalorieBand('all'); setMinProteinG(undefined); }}>Reset filters</button></div>}</section>
            {visibleRecipes.length ? <section className="meal-grid" aria-label="Recipe results">{visibleRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} saved={savedIds.has(recipe.id)} onOpen={() => openRecipe(recipe, 'browse')} onToggleSave={() => toggleSave(recipe)} />)}</section> : <div className="empty-state"><Search aria-hidden="true" /><h2>No meals match all of that</h2><p>Clear a filter or search a broader ingredient or cuisine.</p><button className="secondary-button" type="button" onClick={() => { setQuery(''); setCuisine('All'); setProtein('All'); setMaxMinutes(undefined); setCalorieBand('all'); setMinProteinG(undefined); }}>Clear search and filters</button></div>}
          </div>}

          {route.view === 'saved' && <div className="page-stack"><section className="saved-intro"><div><span className="hero-kicker"><BookmarkCheck aria-hidden="true" /> Your repeat list</span><h2>{savedRecipes.length ? `${savedRecipes.length} saved ${savedRecipes.length === 1 ? 'meal' : 'meals'}` : 'Save the meals that look right'}</h2><p>Saved recipes stay on this device and sync privately when you connect Firebase.</p></div>{savedRecipes.length > 0 && <button className="secondary-button" type="button" onClick={() => navigate({ view: 'browse' })}>Find another meal</button>}</section>{savedRecipes.length ? <section className="meal-grid">{savedRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} saved onOpen={() => openRecipe(recipe, 'saved')} onToggleSave={() => toggleSave(recipe)} />)}</section> : <div className="empty-state"><Bookmark aria-hidden="true" /><h2>Nothing saved yet</h2><p>Use the bookmark on any recipe to build a focused short list.</p><button className="primary-button" type="button" onClick={() => navigate({ view: 'browse' })}>Browse {STARTER_RECIPES.length} recipes</button></div>}</div>}

          {route.view === 'grocery' && <div className="page-stack page-stack--narrow"><section className="grocery-hero"><div><span className="hero-kicker"><ShoppingBasket aria-hidden="true" /> Recipe → store</span><h2>{openShoppingCount ? `${openShoppingCount} ingredients left` : 'Your grocery list is clear'}</h2><p>Every catalog ingredient comes with a plain-English explanation, package advice, a budget format, a best-fit format, and live retailer searches.</p></div>{openShoppingCount > 0 && <button className="secondary-button" type="button" onClick={() => void copyGroceryList()}><Copy aria-hidden="true" /> Copy list</button>}</section><form className="quick-add" onSubmit={(event) => { event.preventDefault(); if (containsBlockedDietTerm(shoppingDraft)) return showToast('That item crosses the vegetarian boundary.'); const added = store.addShoppingItem(shoppingDraft); if (added) { setShoppingDraft(''); showToast(`${added.name} added.`); } }}><input value={shoppingDraft} onChange={(event) => setShoppingDraft(event.target.value)} placeholder="Add another vegetarian item" aria-label="Add grocery item" /><button className="primary-button primary-button--small" type="submit">Add</button></form>
            {shoppingRows.length > 0 ? <div className="grocery-groups">{[...groupedShopping.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([section, items]) => <section className="grocery-group" key={section}><header><div><MapPin aria-hidden="true" /><h3>{section}</h3></div><span>{items.filter((item) => !item.checked).length} left</span></header><div>{[...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt)).map((item) => { const product = STARTER_PRODUCTS.find((candidate) => candidate.name.toLocaleLowerCase() === item.name.toLocaleLowerCase()); const guide = product ? groceryGuideForProductId(product.id) : undefined; const links = retailerLinks(guide?.budget.searchQuery ?? item.name); return <article className={`grocery-row${item.checked ? ' is-checked' : ''}`} key={item.key}><button className="check-button" type="button" onClick={() => { const shouldCheck = !item.checked; item.items.filter((entry) => entry.checked !== shouldCheck).forEach((entry) => store.toggleShoppingItem(entry.id)); }} aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`}>{item.checked && <Check aria-hidden="true" />}</button><div className="grocery-row__name"><h4>{item.name}</h4>{item.amountLabel && <p>{item.amountLabel}</p>}</div><div className="grocery-row__actions">{guide && <button className="guide-button" type="button" onClick={() => setActiveGuide({ guide, amount: item.amountLabel })}>Buying guide</button>}<a className="heb-button" href={links.heb} target="_blank" rel="noreferrer">H‑E‑B <ExternalLink aria-hidden="true" /></a></div><button className="icon-button" type="button" onClick={() => item.items.forEach((entry) => store.deleteShoppingItem(entry.id))} aria-label={`Delete ${item.name}`}><X aria-hidden="true" /></button></article>; })}</div></section>)}</div> : <div className="empty-state"><ShoppingBasket aria-hidden="true" /><h2>Choose a recipe first</h2><p>Open a meal and tap “Get all ingredients.” The exact list and buying guides appear here.</p><button className="primary-button" type="button" onClick={() => navigate({ view: 'browse' })}>Find a meal</button></div>}
            {state.shopping.some((item) => item.checked) && <button className="clear-checked" type="button" onClick={store.clearCheckedShopping}><Trash2 aria-hidden="true" /> Clear checked items</button>}<p className="live-price-note live-price-note--panel">Retailer searches may show current local price, stock, or store location when available. This site never scrapes or freezes retailer data.</p></div>}

          {route.view === 'settings' && <div className="page-stack page-stack--narrow"><section className="settings-card"><div className="section-heading"><div><span className="eyebrow">Appearance</span><h2>Theme</h2></div></div><div className="theme-picker">{(['system', 'light', 'dark'] as RecipesSettings['theme'][]).map((theme) => <button key={theme} type="button" className={state.settings.theme === theme ? 'is-active' : ''} onClick={() => store.updateSettings({ theme })} aria-pressed={state.settings.theme === theme}><span>{theme === 'system' ? <Settings2 aria-hidden="true" /> : theme === 'light' ? <Sparkles aria-hidden="true" /> : <Leaf aria-hidden="true" />}</span><div><strong>{theme[0].toUpperCase() + theme.slice(1)}</strong><small>{theme === 'system' ? 'Follow this device' : `${theme} recipe book`}</small></div>{state.settings.theme === theme && <Check aria-hidden="true" />}</button>)}</div></section>
            <section className="settings-card"><div className="section-heading"><div><span className="eyebrow">Private sync</span><h2>{sync.user ? 'Connected to the owner vault' : 'Keep Saved and Grocery together'}</h2><p>{sync.message ?? (sync.user ? 'Your saved recipes, grocery list, and preferences are privately synchronized.' : 'Everything works locally. Google sign-in adds private cross-device sync.')}</p></div><span className={`status-pill status-pill--${sync.status}`}>{sync.status === 'offline' ? <CloudOff aria-hidden="true" /> : <Cloud aria-hidden="true" />}{syncLabel}</span></div><div className="sync-row"><div className="sync-identity"><span>{sync.user?.displayName?.slice(0, 1).toUpperCase() ?? <Cloud aria-hidden="true" />}</span><div><strong>{sync.user?.displayName ?? 'Local-first mode'}</strong><small>{sync.user?.email ?? `${store.storageMode === 'indexeddb' ? 'IndexedDB + localStorage' : 'localStorage'} on this device`}</small></div></div>{sync.user ? <button className="secondary-button" type="button" onClick={() => void sync.signOut().catch((error) => showToast(error instanceof Error ? error.message : 'Could not sign out.'))} disabled={sync.signingOut}><LogOut aria-hidden="true" /> {sync.signingOut ? 'Finishing sync…' : 'Sign out'}</button> : <button className="primary-button" type="button" onClick={() => void sync.signIn().catch((error) => showToast(error instanceof Error ? error.message : 'Could not sign in.'))}><LogIn aria-hidden="true" /> Sign in with Google</button>}</div>{store.storageWarning && <div className="notice notice--warning"><CircleAlert aria-hidden="true" /><div><strong>Storage fallback active</strong><span>{store.storageWarning}</span></div></div>}</section>
            <section className="settings-card"><div className="section-heading"><div><span className="eyebrow">Data portability</span><h2>Back up your short list</h2><p>Exports contain saved recipes and grocery items. Keep the JSON somewhere private.</p></div></div><div className="settings-actions"><button className="secondary-button" type="button" onClick={exportData}><Download aria-hidden="true" /> Export JSON</button><label className="secondary-button"><Upload aria-hidden="true" /> Import JSON<input className="sr-only" type="file" accept="application/json,.json" onChange={importData} /></label></div></section>
            <section className="settings-card"><div className="section-heading"><div><span className="eyebrow">Catalog promise</span><h2>What this recipe book is—and is not</h2></div></div><div className="principle-grid"><div><Flame aria-hidden="true" /><strong>Substantial by design</strong><p>Every bundled lunch or dinner is one serving and at least 800 kcal.</p></div><div><Egg aria-hidden="true" /><strong>Ovo-lacto vegetarian</strong><p>Eggs and dairy are allowed; meat, fish, shellfish, animal stock, gelatin, lard, and tallow are not.</p></div><div><Store aria-hidden="true" /><strong>Live store handoff</strong><p>Buying guidance is editorial. Current price, inventory, and store location stay with the retailer.</p></div></div><p className="data-footnote">Macros use typical reference nutrition and are not medical advice. Check current packages for nutrition, allergens, vegetarian enzymes, and formula changes.</p></section>
            <section className="danger-zone"><div><strong>Clear this device</strong><p>Removes local saved recipes and grocery items. A confirmed signed-in cloud copy reloads afterward.</p></div><button type="button" onClick={() => void resetLocalData()}><Trash2 aria-hidden="true" /> Clear local data</button></section></div>}
        </div>
      </main>

      {route.view !== 'recipe' && <nav className="bottom-nav" aria-label="Mobile navigation">{VIEWS.map((item) => { const Icon = item.icon; const active = route.view === item.id; return <button key={item.id} className={active ? 'is-active' : ''} type="button" onClick={() => navigate({ view: item.id })} aria-current={active ? 'page' : undefined}><Icon aria-hidden="true" /><span>{item.label}</span>{item.id === 'saved' && savedRecipes.length > 0 && <b>{savedRecipes.length}</b>}{item.id === 'grocery' && openShoppingCount > 0 && <b>{openShoppingCount}</b>}</button>; })}</nav>}
      {activeGuide && <BuyingGuide guide={activeGuide.guide} amountLabel={activeGuide.amount} onClose={() => setActiveGuide(undefined)} />}
      {toast && <div className="toast" role="status"><Check aria-hidden="true" /><span>{toast}</span></div>}
      {sync.signingOut && <SignOutStatus />}
    </div>
  );
}

export default App;
