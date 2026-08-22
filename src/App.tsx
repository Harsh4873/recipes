import {
  ArrowRightLeft,
  Barcode,
  BookOpen,
  Bot,
  Check,
  ChefHat,
  ChevronRight,
  CircleAlert,
  Cloud,
  CloudOff,
  Database,
  Download,
  Egg,
  ExternalLink,
  Flame,
  Gauge,
  Leaf,
  LoaderCircle,
  LogIn,
  LogOut,
  PackageOpen,
  PackagePlus,
  Plus,
  Search,
  Settings2,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Upload,
  Wheat,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { canUseAiChef } from './ai-access';
import { STARTER_PRODUCTS, STARTER_RECIPES, searchStarterProducts } from './catalog';
import { classifyVegetarian, containsBlockedDietTerm } from './diet';
import { firebaseAppCheckConfigured } from './firebase';
import type { Product, Recipe, RecipesSettings, ShoppingItem } from './model';
import { createId } from './model';
import {
  ProductApiError,
  lookupOpenFoodFactsBarcode,
  submitOpenFoodFactsSearch,
  submitUsdaSearch,
} from './product-api';
import { generateSmartRecipes, ingredientIsAvailable, matchRecipes, missingIngredients } from './recipe-engine';
import { useRecipesStore } from './store';
import { useRecipesSync } from './useRecipesSync';

type View = 'cook' | 'pantry' | 'recipes' | 'list' | 'settings';

interface ViewDefinition {
  readonly id: View;
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly icon: LucideIcon;
}

const VIEWS: readonly ViewDefinition[] = [
  { id: 'cook', label: 'Cook', eyebrow: 'Products → meals', title: 'Make something good', icon: ChefHat },
  { id: 'pantry', label: 'Pantry', eyebrow: 'Your products', title: 'Build your pantry', icon: PackageOpen },
  { id: 'recipes', label: 'Recipes', eyebrow: 'Meals → products', title: 'Recipe library', icon: BookOpen },
  { id: 'list', label: 'List', eyebrow: 'What is missing', title: 'Shopping list', icon: ShoppingBasket },
  { id: 'settings', label: 'Settings', eyebrow: 'Private + local-first', title: 'Preferences and sync', icon: Settings2 },
];

function routeFromHash(): View {
  const candidate = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return VIEWS.some((view) => view.id === candidate) ? candidate as View : 'cook';
}

function useHashView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(routeFromHash);
  useEffect(() => {
    const update = () => setView(routeFromHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const navigate = useCallback((next: View) => {
    if (window.location.hash !== `#/${next}`) window.location.hash = `/${next}`;
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return [view, navigate];
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function MacroStrip({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const nutrition = recipe.nutritionPerServing;
  return (
    <div className={`macro-strip${compact ? ' macro-strip--compact' : ''}`} aria-label="Macros per serving">
      <div className="macro-stat macro-stat--calories"><span>kcal</span><strong>{formatNumber(nutrition.calories)}</strong></div>
      <div className="macro-stat macro-stat--protein"><span>protein</span><strong>{formatNumber(nutrition.proteinG, 1)}g</strong></div>
      <div className="macro-stat macro-stat--carbs"><span>carbs</span><strong>{formatNumber(nutrition.carbsG, 1)}g</strong></div>
      <div className="macro-stat macro-stat--fat"><span>fat</span><strong>{formatNumber(nutrition.fatG, 1)}g</strong></div>
    </div>
  );
}

function ProductMacros({ product }: { product: Product }) {
  const nutrition = product.nutritionPerServing;
  return (
    <div className="product-macros" aria-label={`Macros per ${product.serving.label}`}>
      <span><b>{formatNumber(nutrition.calories)}</b> kcal</span>
      <span><b>{formatNumber(nutrition.proteinG, 1)}</b>P</span>
      <span><b>{formatNumber(nutrition.carbsG, 1)}</b>C</span>
      <span><b>{formatNumber(nutrition.fatG, 1)}</b>F</span>
    </div>
  );
}

function productGlyph(product: Product): ReactNode {
  const text = `${product.name} ${product.categories.join(' ')}`.toLowerCase();
  if (/egg/.test(text)) return <Egg aria-hidden="true" />;
  if (/rice|bread|oat|pasta|tortilla|naan|paratha|base/.test(text)) return <Wheat aria-hidden="true" />;
  if (/tofu|paneer|bean|lentil|chickpea|yogurt|tempeh|seitan|protein/.test(text)) return <Gauge aria-hidden="true" />;
  return <Leaf aria-hidden="true" />;
}

function RecipeCard({
  recipe,
  onOpen,
  coverage,
}: {
  recipe: Recipe;
  onOpen: () => void;
  coverage?: number;
}) {
  const tone = recipe.cuisine.toLowerCase().includes('indian') ? 'saffron'
    : recipe.tags.some((tag) => tag.includes('breakfast')) ? 'berry'
      : recipe.tags.some((tag) => tag.includes('plant')) ? 'mint'
        : 'leaf';
  return (
    <button className="recipe-card" type="button" onClick={onOpen} aria-label={`Open ${recipe.title}`}>
      <div className="recipe-card__art" data-tone={tone}>
        <span className="recipe-card__mark"><ChefHat aria-hidden="true" /></span>
        <div className="recipe-card__art-copy">
          <span>{recipe.cuisine}</span>
          <strong>{recipe.prepMinutes + recipe.cookMinutes} min</strong>
        </div>
      </div>
      <div className="recipe-card__body">
        <div className="recipe-card__topline">
          <span className="recipe-origin">{recipe.origin === 'firebase-ai' ? 'AI draft' : recipe.origin === 'smart' ? 'Smart draft' : recipe.origin === 'starter' ? 'Test kitchen' : 'Saved'}</span>
          {coverage !== undefined && <span className={coverage === 1 ? 'coverage coverage--full' : 'coverage'}>{Math.round(coverage * 100)}% on hand</span>}
        </div>
        <h3>{recipe.title}</h3>
        <p>{recipe.description}</p>
        <MacroStrip recipe={recipe} compact />
        <div className="recipe-card__footer">
          <span>{recipe.servings} servings</span>
          <span className="recipe-card__open">View recipe <ChevronRight aria-hidden="true" /></span>
        </div>
      </div>
    </button>
  );
}

function ProductCard({
  product,
  inPantry,
  onAdd,
  onRemove,
}: {
  product: Product;
  inPantry: boolean;
  onAdd: () => void;
  onRemove?: () => void;
}) {
  const status = product.eligibility.status;
  return (
    <article className={`product-card${status === 'blocked' ? ' product-card--blocked' : ''}`}>
      <div className="product-card__icon">{productGlyph(product)}</div>
      <div className="product-card__content">
        <div className="product-card__title-row">
          <div>
            <h3>{product.name}</h3>
            <p>{[product.brand, product.serving.label].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`diet-badge diet-badge--${status}`}>{status === 'allowed' ? 'Vegetarian' : status === 'review' ? 'Check label' : 'Blocked'}</span>
        </div>
        {product.provenance.coreMacrosComplete
          ? <ProductMacros product={product} />
          : <div className="product-macros"><span><b>Label needed</b> · core macros incomplete</span></div>}
        <div className="product-card__meta">
          <span>{product.provenance.providerName}</span>
          {product.provenance.quality !== 'complete' && product.provenance.quality !== 'verified' && <span>{product.provenance.quality} data</span>}
        </div>
      </div>
      <div className="product-card__actions">
        {inPantry ? (
          onRemove ? <button className="icon-button icon-button--danger" type="button" onClick={onRemove} aria-label={`Remove ${product.name}`}><Trash2 aria-hidden="true" /></button>
            : <span className="added-label"><Check aria-hidden="true" /> Added</span>
        ) : (
          <button className="button button--small" type="button" onClick={onAdd} disabled={status === 'blocked'}>
            {!product.provenance.coreMacrosComplete ? 'Needs label' : status === 'review' ? 'Review' : 'Add'}
          </button>
        )}
      </div>
    </article>
  );
}

function Dialog({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const appRoot = document.getElementById('root');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    const rootWasInert = appRoot?.inert ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;

    const focusable = () => dialog
      ? [...dialog.querySelectorAll<HTMLElement>([
          'a[href]',
          'button:not([disabled])',
          'input:not([disabled]):not([type="hidden"])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
        ].join(','))].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      : [];
    const focusInitial = () => {
      if (!dialog) return;
      const target = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?? dialog.querySelector<HTMLElement>('[data-dialog-heading]')
        ?? dialog;
      target.focus({ preventScroll: true });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        items.at(-1)?.focus({ preventScroll: true });
      } else if (!event.shiftKey && (activeIndex < 0 || activeIndex === items.length - 1)) {
        event.preventDefault();
        items[0].focus({ preventScroll: true });
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) focusInitial();
    };
    focusInitial();
    document.body.style.overflow = 'hidden';
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }
    const frame = window.requestAnimationFrame(focusInitial);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', containFocus, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', containFocus, true);
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
      <section ref={dialogRef} className={`dialog${wide ? ' dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="dialog__header">
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId} data-dialog-heading tabIndex={-1}>{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </header>
        <div className="dialog__body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

function SignOutStatus() {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const appRoot = document.getElementById('root');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const rootWasInert = appRoot?.inert ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    document.body.style.overflow = 'hidden';
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (appRoot) {
        appRoot.inert = rootWasInert;
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="signout-scrim" role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div ref={panelRef} tabIndex={-1}>
        <LoaderCircle className="spin" aria-hidden="true" />
        <strong id={titleId}>Finishing private sync…</strong>
        <span id={descriptionId}>Keep Recipes open while the latest confirmed copy is protected.</span>
      </div>
    </div>,
    document.body,
  );
}

function RecipeDialog({
  recipe,
  pantry,
  saved,
  onClose,
  onSave,
  onDelete,
  onAddMissing,
}: {
  recipe: Recipe;
  pantry: readonly Product[];
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onAddMissing: () => void;
}) {
  const missing = missingIngredients(recipe, pantry);
  return (
    <Dialog title={recipe.title} eyebrow={`${recipe.cuisine} · ${recipe.prepMinutes + recipe.cookMinutes} min`} onClose={onClose} wide>
      <div className="recipe-detail__intro">
        <div>
          <p className="recipe-detail__description">{recipe.description}</p>
          <div className="tag-row">{recipe.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </div>
        <MacroStrip recipe={recipe} />
      </div>
      {recipe.macroCoverage < 1 && (
        <div className="notice notice--warning"><CircleAlert aria-hidden="true" /><div><strong>Partial macro coverage</strong><span>Totals include only matched product snapshots. Review unresolved ingredients.</span></div></div>
      )}
      <div className="recipe-detail__grid">
        <section>
          <div className="subsection-title"><h3>Ingredients</h3><span>{recipe.servings} servings</span></div>
          <ul className="ingredient-list">
            {recipe.ingredients.map((ingredient) => {
              const available = ingredientIsAvailable(ingredient, pantry);
              return (
                <li key={ingredient.id}>
                  <span className={`ingredient-check${available ? ' is-available' : ''}`}>{available ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}</span>
                  <span><strong>{ingredient.name}</strong><small>{ingredient.amountLabel}{ingredient.optional ? ' · optional' : ''}</small></span>
                  {!available && (
                    <a className="outbound-link" href={`https://www.heb.com/search/?q=${encodeURIComponent(ingredient.name)}`} target="_blank" rel="noreferrer" aria-label={`Search H-E-B for ${ingredient.name}`}><ExternalLink aria-hidden="true" /></a>
                  )}
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && <button className="button button--secondary button--full" type="button" onClick={onAddMissing}><ShoppingBasket aria-hidden="true" /> Add {missing.length} missing {missing.length === 1 ? 'item' : 'items'} to list</button>}
        </section>
        <section>
          <div className="subsection-title"><h3>Method</h3><span>{recipe.prepMinutes} prep · {recipe.cookMinutes} cook</span></div>
          <ol className="step-list">{recipe.steps.map((step, index) => <li key={`${recipe.id}-step-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
        </section>
      </div>
      <footer className="dialog__footer">
        {saved ? <button className="button button--ghost button--danger-text" type="button" onClick={onDelete}><Trash2 aria-hidden="true" /> Remove saved recipe</button> : <span className="dialog__hint">Nutrition is calculated from product snapshots.</span>}
        <button className="button" type="button" onClick={saved ? onClose : onSave}>{saved ? <Check aria-hidden="true" /> : <BookOpen aria-hidden="true" />}{saved ? 'Saved' : 'Save recipe'}</button>
      </footer>
    </Dialog>
  );
}

interface ManualProductDraft {
  name: string;
  brand: string;
  servingLabel: string;
  ingredientsText: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  sodiumMg: string;
}

const EMPTY_MANUAL: ManualProductDraft = {
  name: '', brand: '', servingLabel: '1 serving', ingredientsText: '', calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '', sodiumMg: '',
};

function ManualProductDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (product: Product) => void }) {
  const [draft, setDraft] = useState(EMPTY_MANUAL);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();
  const update = (field: keyof ManualProductDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.calories || !draft.proteinG || !draft.carbsG || !draft.fatG) return setError('Add a name and all four core macros.');
    const coreMacros = [draft.calories, draft.proteinG, draft.carbsG, draft.fatG].map(Number);
    if (coreMacros.some((value) => !Number.isFinite(value) || value < 0)) return setError('Core macros must be valid numbers of zero or more.');
    if (!confirmed) return setError('Confirm that you checked the product label.');
    const eligibility = classifyVegetarian({ name: draft.name, ingredientsText: draft.ingredientsText, ownerApproved: confirmed });
    if (eligibility.status !== 'allowed') return setError(eligibility.reason);
    const now = new Date().toISOString();
    const product: Product = {
      id: createId('manual-product'),
      name: draft.name.trim(),
      brand: draft.brand.trim() || undefined,
      categories: ['manual'],
      aliases: [],
      ingredientsText: draft.ingredientsText.trim() || undefined,
      serving: { quantity: 1, unit: 'serving', label: draft.servingLabel.trim() || '1 serving' },
      nutritionPerServing: {
        calories: Math.max(0, Number(draft.calories)),
        proteinG: Math.max(0, Number(draft.proteinG)),
        carbsG: Math.max(0, Number(draft.carbsG)),
        fatG: Math.max(0, Number(draft.fatG)),
        saturatedFatG: 0,
        fiberG: Math.max(0, Number(draft.fiberG || 0)),
        sugarG: 0,
        sodiumMg: Math.max(0, Number(draft.sodiumMg || 0)),
      },
      provenance: { kind: 'manual', providerName: 'Package label', quality: 'verified', coreMacrosComplete: true, warnings: ['Entered manually; compare with the current package label.'] },
      eligibility,
      createdAt: now,
      updatedAt: now,
    };
    onAdd(product);
  };
  return (
    <Dialog title="Add a product label" eyebrow="Manual + private" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="field-grid field-grid--two">
          <label className="field"><span>Product name</span><input value={draft.name} onChange={update('name')} placeholder="Deep palak paneer" data-dialog-initial-focus /></label>
          <label className="field"><span>Brand <small>optional</small></span><input value={draft.brand} onChange={update('brand')} placeholder="Brand" /></label>
        </div>
        <label className="field"><span>Serving on label</span><input value={draft.servingLabel} onChange={update('servingLabel')} placeholder="1 tray (283 g)" /></label>
        <div className="field-grid field-grid--four">
          <label className="field"><span>Calories</span><input inputMode="decimal" type="number" min="0" step="any" value={draft.calories} onChange={update('calories')} /></label>
          <label className="field"><span>Protein g</span><input inputMode="decimal" type="number" min="0" step="any" value={draft.proteinG} onChange={update('proteinG')} /></label>
          <label className="field"><span>Carbs g</span><input inputMode="decimal" type="number" min="0" step="any" value={draft.carbsG} onChange={update('carbsG')} /></label>
          <label className="field"><span>Fat g</span><input inputMode="decimal" type="number" min="0" step="any" value={draft.fatG} onChange={update('fatG')} /></label>
        </div>
        <div className="field-grid field-grid--two">
          <label className="field"><span>Fiber g <small>optional</small></span><input inputMode="decimal" type="number" min="0" step="any" value={draft.fiberG} onChange={update('fiberG')} /></label>
          <label className="field"><span>Sodium mg <small>optional</small></span><input inputMode="decimal" type="number" min="0" step="any" value={draft.sodiumMg} onChange={update('sodiumMg')} /></label>
        </div>
        <label className="field"><span>Ingredients <small>recommended</small></span><textarea value={draft.ingredientsText} onChange={update('ingredientsText')} placeholder="Paste the package ingredients so the vegetarian gate can check them." rows={3} /></label>
        <label className="check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I checked the current package label.</strong> It has no meat, poultry, fish, shellfish, animal stock, gelatin, lard, or tallow.</span></label>
        {error && <div className="form-error"><CircleAlert aria-hidden="true" />{error}</div>}
        <button className="button button--full" type="submit"><PackagePlus aria-hidden="true" /> Add to pantry</button>
      </form>
    </Dialog>
  );
}

function ReviewProductDialog({ product, onClose, onApprove }: { product: Product; onClose: () => void; onApprove: () => void }) {
  return (
    <Dialog title={`Review ${product.name}`} eyebrow="Strict vegetarian check" onClose={onClose}>
      <div className="review-stack">
        <div className="notice notice--warning"><CircleAlert aria-hidden="true" /><div><strong>Provider status is incomplete</strong><span>{product.eligibility.reason}</span></div></div>
        <div className="review-label"><span>Source</span><strong>{product.provenance.providerName}</strong></div>
        <div className="review-label"><span>Serving</span><strong>{product.serving.label}</strong></div>
        <ProductMacros product={product} />
        <div className="ingredient-copy"><span>Ingredient statement</span><p>{product.ingredientsText || 'No ingredient statement was supplied by the provider. Check the physical package.'}</p></div>
        <p className="review-disclaimer">This check is about vegetarian suitability, not allergy safety. Always verify the package for allergens and formula changes.</p>
        <button className="button button--full" type="button" onClick={onApprove}><Check aria-hidden="true" /> I checked it — add product</button>
      </div>
    </Dialog>
  );
}

function App() {
  const store = useRecipesStore();
  const sync = useRecipesSync(store);
  const [view, navigate] = useHashView();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftRecipes, setDraftRecipes] = useState<Recipe[]>([]);
  const [activeRecipe, setActiveRecipe] = useState<Recipe>();
  const [reviewProduct, setReviewProduct] = useState<Product>();
  const [manualOpen, setManualOpen] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [pantryQuery, setPantryQuery] = useState('');
  const [onlineProducts, setOnlineProducts] = useState<Product[]>([]);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState<string>();
  const [chefNote, setChefNote] = useState('high protein, weeknight friendly');
  const [aiBusy, setAiBusy] = useState(false);
  const [shoppingDraft, setShoppingDraft] = useState('');
  const [toast, setToast] = useState<string>();

  const showToast = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3_200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const state = store.state;
  useEffect(() => {
    if (!state) return;
    const theme = state.settings.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [state?.settings.theme]);

  const localResults = useMemo(() => searchStarterProducts(pantryQuery, 12), [pantryQuery]);
  const allRecipes = useMemo(() => {
    if (!state) return STARTER_RECIPES;
    const savedIds = new Set(state.recipes.map((recipe) => recipe.id));
    return [...state.recipes, ...STARTER_RECIPES.filter((recipe) => !savedIds.has(recipe.id))];
  }, [state]);
  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase();
    if (!query) return allRecipes;
    return allRecipes.filter((recipe) => [recipe.title, recipe.description, recipe.cuisine, ...recipe.tags].join(' ').toLowerCase().includes(query));
  }, [allRecipes, recipeSearch]);
  const recipeMatches = useMemo(() => state ? matchRecipes(allRecipes, state.pantry, { calories: state.settings.calorieTarget, proteinG: state.settings.proteinTargetG }) : [], [allRecipes, state]);
  const selectedProducts = useMemo(() => state?.pantry.filter((product) => selectedIds.has(product.id)) ?? [], [selectedIds, state]);
  const currentView = VIEWS.find((candidate) => candidate.id === view) ?? VIEWS[0];
  const aiAvailable = canUseAiChef({
    signedIn: Boolean(sync.user),
    ownerVaultReady: Boolean(sync.vaultId),
    appCheckConfigured: firebaseAppCheckConfigured,
  });

  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const addProduct = (product: Product) => {
    if (product.eligibility.status === 'blocked') return showToast('That product crossed the vegetarian boundary.');
    if (!product.provenance.coreMacrosComplete) return showToast('This result is missing calories, protein, carbs, or fat. Add it manually from the current label.');
    if (product.eligibility.status === 'review') return setReviewProduct(product);
    const added = store.addPantryProduct(product);
    if (added) {
      setSelectedIds((current) => new Set(current).add(added.id));
      showToast(`${added.name} added to your pantry.`);
    }
  };

  const approveReviewedProduct = () => {
    if (!reviewProduct) return;
    const now = new Date().toISOString();
    const approved = {
      ...reviewProduct,
      eligibility: classifyVegetarian({ name: reviewProduct.name, ingredientsText: reviewProduct.ingredientsText, ownerApproved: true, now }),
      updatedAt: now,
    };
    setReviewProduct(undefined);
    addProduct(approved);
  };

  const searchOnline = async (event?: FormEvent) => {
    event?.preventDefault();
    const query = pantryQuery.trim();
    if (query.length < 2) return showToast('Enter at least two characters.');
    setOnlineSearching(true);
    setOnlineMessage(undefined);
    const barcode = /^\d{4,24}$/.test(query.replace(/[\s-]/g, ''));
    const usdaController = new AbortController();
    let usdaDeferred = false;
    let usdaTimer: number | undefined;
    try {
      const boundedUsda = Promise.race([
        submitUsdaSearch(query, { limit: 10, signal: usdaController.signal }),
        new Promise<Product[]>((resolve) => {
          usdaTimer = window.setTimeout(() => {
            usdaDeferred = true;
            usdaController.abort();
            resolve([]);
          }, 3_500);
        }),
      ]).finally(() => {
        if (usdaTimer !== undefined) window.clearTimeout(usdaTimer);
      });
      const requests: Promise<Product[]>[] = [
        boundedUsda,
        barcode
          ? lookupOpenFoodFactsBarcode(query).then((product) => product ? [product] : [])
          : submitOpenFoodFactsSearch(query, { limit: 10 }),
      ];
      const settled = await Promise.allSettled(requests);
      const products = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
      const deduped = new Map<string, Product>();
      products.forEach((product) => deduped.set(product.barcode ? `barcode:${product.barcode}` : product.id, product));
      setOnlineProducts([...deduped.values()]);
      const failures = settled.filter((result) => result.status === 'rejected');
      if (deduped.size === 0 && failures.length > 0) throw (failures[0] as PromiseRejectedResult).reason;
      setOnlineMessage(`${deduped.size} package ${deduped.size === 1 ? 'match' : 'matches'} from open product data.${usdaDeferred ? ' USDA is cooling down; try it again shortly.' : ''}`);
    } catch (error) {
      const message = error instanceof ProductApiError ? error.message : error instanceof Error ? error.message : 'Product search could not finish.';
      setOnlineMessage(message);
      setOnlineProducts([]);
    } finally {
      if (usdaTimer !== undefined) window.clearTimeout(usdaTimer);
      setOnlineSearching(false);
    }
  };

  const generateLocal = () => {
    if (!state) return;
    const generated = generateSmartRecipes(selectedProducts, { calories: state.settings.calorieTarget, proteinG: state.settings.proteinTargetG });
    if (generated.length === 0) return showToast('Choose at least two products, including a protein and a base when possible.');
    setDraftRecipes(generated);
    setActiveRecipe(generated[0]);
  };

  const generateAi = async () => {
    if (!state) return;
    if (!sync.user || !sync.vaultId) return showToast('Owner sign-in is required before the AI chef can use selected product details.');
    if (!firebaseAppCheckConfigured) return showToast('The AI chef stays off until Firebase App Check is configured.');
    setAiBusy(true);
    try {
      const { generateRecipeWithFirebaseAI } = await import('./ai-recipe');
      const recipe = await generateRecipeWithFirebaseAI({
        products: selectedProducts,
        note: chefNote,
        calorieTarget: state.settings.calorieTarget,
        proteinTargetG: state.settings.proteinTargetG,
        maxCookMinutes: state.settings.maxCookMinutes,
      });
      setDraftRecipes((current) => [recipe, ...current.filter((item) => item.id !== recipe.id)]);
      setActiveRecipe(recipe);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The AI chef could not finish.');
    } finally {
      setAiBusy(false);
    }
  };

  const addMissingForRecipe = (recipe: Recipe) => {
    if (!state) return;
    const missing = missingIngredients(recipe, state.pantry);
    const added = store.addShoppingItems(missing.map((ingredient) => ({ name: ingredient.name, amountLabel: ingredient.amountLabel, recipeId: recipe.id })));
    showToast(added.length ? `${added.length} missing ${added.length === 1 ? 'item' : 'items'} added.` : 'Those items are already on your list.');
  };

  const exportData = () => {
    try {
      const blob = new Blob([store.exportState()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `recipes-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not export Recipes.');
    }
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      store.importState(await file.text());
      showToast('Recipes backup imported.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That backup could not be imported.');
    }
  };

  const resetLocalData = async () => {
    if (sync.user && sync.status !== 'synced') {
      showToast('Wait for a confirmed sync—or export a backup—before clearing this device.');
      return;
    }
    if (!window.confirm('Clear Recipes only on this device? Export a backup first if you need one.')) return;
    try {
      await store.clearLocalData();
      setSelectedIds(new Set());
      setDraftRecipes([]);
      if (sync.user) window.location.reload();
      else showToast('Recipes was cleared on this device.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not clear local Recipes data safely.');
    }
  };

  if (!store.hydrated || !state) {
    return <main className="loading-screen"><div className="brand-mark"><Leaf aria-hidden="true" /></div><LoaderCircle className="spin" aria-hidden="true" /><p>Opening your kitchen…</p></main>;
  }

  const syncLabel = sync.status === 'synced' ? 'Synced' : sync.status === 'syncing' ? 'Syncing' : sync.status === 'offline' ? 'Offline' : sync.status === 'action-needed' ? 'Action needed' : 'On this device';
  const statusIcon = sync.status === 'offline' ? <CloudOff aria-hidden="true" /> : <Cloud aria-hidden="true" />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navigate('cook')} aria-label="Recipes home"><span className="brand-mark"><Leaf aria-hidden="true" /></span><span><strong>Recipes</strong><small>vegetarian kitchen</small></span></button>
        <nav className="nav" aria-label="Primary navigation">
          <span className="nav__label">Workspace</span>
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav__item${view === item.id ? ' is-active' : ''}`} type="button" onClick={() => navigate(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span>{item.id === 'list' && state.shopping.filter((entry) => !entry.checked).length > 0 && <b>{state.shopping.filter((entry) => !entry.checked).length}</b>}</button>;
          })}
        </nav>
        <div className="diet-lock"><span><Leaf aria-hidden="true" /></span><div><strong>Vegetarian locked</strong><small>Eggs + dairy allowed</small></div></div>
        <div className="sidebar__footer">
          <button className="sync-card" type="button" onClick={() => navigate('settings')}>
            <span className={`sync-dot sync-dot--${sync.status}`} />
            <span><strong>{syncLabel}</strong><small>{sync.user ? 'Private Firebase vault' : 'Local-first storage'}</small></span>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">{currentView.eyebrow}</span><h1>{currentView.title}</h1></div>
          <div className="topbar__actions">
            <span className={`status-pill status-pill--${sync.status}`}>{statusIcon}{syncLabel}</span>
            {view !== 'pantry' && <button className="button button--small topbar__primary" type="button" onClick={() => navigate('pantry')}><Plus aria-hidden="true" /> Add product</button>}
          </div>
        </header>

        <div className="page">
          {view === 'cook' && (
            <div className="page-stack">
              <section className="cook-hero">
                <div className="cook-hero__copy">
                  <span className="hero-kicker"><Sparkles aria-hidden="true" /> Pantry → recipe</span>
                  <h2>Start with what you have.<br /><em>Land on your macros.</em></h2>
                  <p>Choose products from your pantry. The smart chef builds vegetarian meal ideas and calculates every macro from saved labels—not guesses.</p>
                  <div className="hero-metrics">
                    <div><Flame aria-hidden="true" /><span><strong>{state.settings.calorieTarget}</strong> kcal target</span></div>
                    <div><Gauge aria-hidden="true" /><span><strong>{state.settings.proteinTargetG}g</strong> protein target</span></div>
                    <div><Leaf aria-hidden="true" /><span><strong>Strict</strong> vegetarian gate</span></div>
                  </div>
                </div>
                <div className="hero-orbit" aria-hidden="true">
                  <div className="hero-orbit__plate"><Leaf /></div>
                  <span className="orbit-chip orbit-chip--one"><Gauge /> Protein</span>
                  <span className="orbit-chip orbit-chip--two"><Wheat /> Base</span>
                  <span className="orbit-chip orbit-chip--three"><Sparkles /> Flavor</span>
                </div>
              </section>

              <section className="generator-panel panel">
                <div className="section-head">
                  <div><span className="eyebrow">1 · Choose products</span><h2>What are we working with?</h2><p>Select two or more reviewed products from your pantry.</p></div>
                  <button className="button button--secondary button--small" type="button" onClick={() => navigate('pantry')}><PackagePlus aria-hidden="true" /> Add more</button>
                </div>
                {state.pantry.length > 0 ? (
                  <div className="product-chips">
                    {state.pantry.map((product) => <button key={product.id} className={`product-chip${selectedIds.has(product.id) ? ' is-selected' : ''}`} type="button" onClick={() => toggleSelected(product.id)}><span>{productGlyph(product)}</span><span><strong>{product.name}</strong><small>{formatNumber(product.nutritionPerServing.proteinG, 1)}g protein</small></span>{selectedIds.has(product.id) && <Check aria-hidden="true" />}</button>)}
                  </div>
                ) : (
                  <div className="empty-state empty-state--inline"><PackageOpen aria-hidden="true" /><div><strong>Your pantry is empty</strong><p>Add H‑E‑B products, Indian packaged foods, frozen vegetables, tortillas, or any label you have.</p></div><button className="button button--small" type="button" onClick={() => navigate('pantry')}>Build pantry</button></div>
                )}
                <div className="generator-divider"><ArrowRightLeft aria-hidden="true" /></div>
                <div className="generator-controls">
                  <div className="generator-prompt"><label htmlFor="chef-note">2 · Tell the chef what sounds good</label><div className="prompt-input"><Sparkles aria-hidden="true" /><input id="chef-note" value={chefNote} onChange={(event) => setChefNote(event.target.value)} placeholder="high protein, spicy, 20 minutes…" /></div></div>
                  <div className="generator-actions">
                    <button className="button button--secondary" type="button" onClick={generateLocal}><ChefHat aria-hidden="true" /> Smart ideas</button>
                    {aiAvailable && <button className="button" type="button" onClick={generateAi} disabled={aiBusy}><Bot aria-hidden="true" className={aiBusy ? 'spin' : ''} /> {aiBusy ? 'Drafting…' : 'Ask AI chef'}</button>}
                  </div>
                </div>
                <p className="generator-note"><Database aria-hidden="true" /><span><strong>Smart Ideas stays on this device.</strong> {aiAvailable ? 'AI privacy: Google receives only the chef prompt and meal targets plus each selected product’s ID, name, brand, serving, and four core macros. Unselected pantry items, saved recipes, and shopping history are not sent.' : `The optional AI chef remains hidden until ${firebaseAppCheckConfigured ? 'the owner signs in and private vault access is confirmed' : 'owner sign-in and Firebase App Check are both ready'}. If enabled, Google receives only the chef prompt, targets, and selected product details—not the rest of the pantry or history.`} Product snapshots—not AI—calculate nutrition.</span></p>
              </section>

              {draftRecipes.length > 0 && (
                <section>
                  <div className="section-head"><div><span className="eyebrow">Fresh drafts</span><h2>Made from your selection</h2></div></div>
                  <div className="recipe-grid">{draftRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => setActiveRecipe(recipe)} coverage={1} />)}</div>
                </section>
              )}

              <section>
                <div className="section-head"><div><span className="eyebrow">Recipe → products</span><h2>{state.pantry.length ? 'Best matches for your pantry' : 'Start with a proven meal'}</h2><p>{state.pantry.length ? 'Ranked by what you already have, then by macro fit.' : 'Every starter recipe is vegetarian and built from deterministic product macros.'}</p></div><button className="text-button" type="button" onClick={() => navigate('recipes')}>Browse all <ChevronRight aria-hidden="true" /></button></div>
                <div className="recipe-grid">{recipeMatches.slice(0, 6).map((match) => <RecipeCard key={match.recipe.id} recipe={match.recipe} coverage={match.coverage} onOpen={() => setActiveRecipe(match.recipe)} />)}</div>
              </section>
            </div>
          )}

          {view === 'pantry' && (
            <div className="page-stack">
              <section className="search-hero panel">
                <div className="search-hero__intro"><span className="hero-kicker"><Barcode aria-hidden="true" /> Products + macros</span><h2>Search a package, barcode, or staple.</h2><p>Try “H‑E‑B tortillas,” “Deep paneer,” “frozen edamame,” or a barcode. Online search runs only when you submit.</p></div>
                <form className="search-form" onSubmit={searchOnline}>
                  <Search aria-hidden="true" />
                  <input value={pantryQuery} onChange={(event) => setPantryQuery(event.target.value)} placeholder="Search products and ingredients" aria-label="Search products and ingredients" />
                  <button className="button" type="submit" disabled={onlineSearching}>{onlineSearching ? <LoaderCircle className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />} Search online</button>
                </form>
                <div className="quick-searches"><span>Try</span>{['H-E-B tortillas', 'Deep paneer', 'frozen vegetables', 'Swad chickpeas'].map((query) => <button type="button" key={query} onClick={() => setPantryQuery(query)}>{query}</button>)}</div>
                <div className="source-row"><span><Database aria-hidden="true" /> USDA CC0 macros</span><span><Leaf aria-hidden="true" /> Open Food Facts packages</span><span><CloudOff aria-hidden="true" /> Local catalog offline</span></div>
              </section>

              {state.pantry.length > 0 && (
                <section>
                  <div className="section-head"><div><span className="eyebrow">On this device</span><h2>Your pantry <span className="count-badge">{state.pantry.length}</span></h2></div><button className="button button--secondary button--small" type="button" onClick={() => setManualOpen(true)}><Plus aria-hidden="true" /> Enter label</button></div>
                  <div className="product-list">{state.pantry.map((product) => <ProductCard key={product.id} product={product} inPantry onAdd={() => undefined} onRemove={() => { store.deleteProduct(product.id); setSelectedIds((current) => { const next = new Set(current); next.delete(product.id); return next; }); }} />)}</div>
                </section>
              )}

              <section>
                <div className="section-head"><div><span className="eyebrow">Instant + offline</span><h2>Vegetarian starter catalog</h2><p>Curated USDA-backed staples fail closed outside the vegetarian boundary.</p></div><button className="button button--secondary button--small" type="button" onClick={() => setManualOpen(true)}><Plus aria-hidden="true" /> Enter label</button></div>
                <div className="product-list">{localResults.map((product) => <ProductCard key={product.id} product={product} inPantry={state.pantry.some((item) => item.id === product.id)} onAdd={() => addProduct(product)} />)}</div>
              </section>

              {(onlineProducts.length > 0 || onlineMessage) && (
                <section>
                  <div className="section-head"><div><span className="eyebrow">Submitted search</span><h2>Online package matches</h2>{onlineMessage && <p>{onlineMessage}</p>}</div></div>
                  {onlineProducts.length > 0 ? <div className="product-list">{onlineProducts.map((product) => <ProductCard key={product.id} product={product} inPantry={state.pantry.some((item) => item.id === product.id || Boolean(item.barcode && item.barcode === product.barcode))} onAdd={() => addProduct(product)} />)}</div> : <div className="empty-state"><Search aria-hidden="true" /><strong>No usable product matches</strong><p>Try a brand plus product name, enter a barcode, or add the label manually.</p></div>}
                  <p className="data-footnote">Open Food Facts is community-contributed and USDA branded records can lag a package update. Review the current label. These sources do not provide reliable H‑E‑B price, aisle, or store inventory.</p>
                </section>
              )}
            </div>
          )}

          {view === 'recipes' && (
            <div className="page-stack">
              <section className="library-toolbar panel">
                <div><span className="hero-kicker"><ArrowRightLeft aria-hidden="true" /> Recipe → products</span><h2>Find the meal, then see what is missing.</h2><p>Coverage compares each ingredient against your pantry. One tap moves the rest to your list.</p></div>
                <label className="library-search"><Search aria-hidden="true" /><input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Search bowls, paneer, tacos…" /></label>
                <div className="library-stats"><span><strong>{state.recipes.length}</strong> saved</span><span><strong>{STARTER_RECIPES.length}</strong> test-kitchen</span><span><strong>{state.pantry.length}</strong> pantry products</span></div>
              </section>
              {filteredRecipes.length > 0 ? <div className="recipe-grid">{filteredRecipes.map((recipe) => { const match = recipeMatches.find((item) => item.recipe.id === recipe.id); return <RecipeCard key={recipe.id} recipe={recipe} coverage={match?.coverage} onOpen={() => setActiveRecipe(recipe)} />; })}</div>
                : <div className="empty-state"><BookOpen aria-hidden="true" /><strong>No recipes match that search</strong><p>Try a product, cuisine, or tag.</p></div>}
            </div>
          )}

          {view === 'list' && (
            <div className="page-stack page-stack--narrow">
              <section className="list-summary">
                <div className="list-summary__icon"><ShoppingBasket aria-hidden="true" /></div>
                <div><span className="eyebrow">Recipe → cart</span><h2>{state.shopping.filter((item) => !item.checked).length} left to pick up</h2><p>Missing recipe products and anything else you add land here.</p></div>
                {state.shopping.some((item) => item.checked) && <button className="text-button text-button--danger" type="button" onClick={store.clearCheckedShopping}><Trash2 aria-hidden="true" /> Clear checked</button>}
              </section>
              <form className="quick-add panel" onSubmit={(event) => { event.preventDefault(); if (containsBlockedDietTerm(shoppingDraft)) { showToast('That item crosses the vegetarian boundary.'); return; } const added = store.addShoppingItem(shoppingDraft); if (added) { setShoppingDraft(''); showToast(`${added.name} added.`); } }}><Plus aria-hidden="true" /><input value={shoppingDraft} onChange={(event) => setShoppingDraft(event.target.value)} placeholder="Add a vegetarian item" aria-label="Add vegetarian shopping item" /><button className="button button--small" type="submit">Add</button></form>
              {state.shopping.length > 0 ? (
                <section className="shopping-list panel">
                  {[...state.shopping].sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt)).map((item: ShoppingItem) => (
                    <div className={`shopping-row${item.checked ? ' is-checked' : ''}`} key={item.id}>
                      <button className="shopping-check" type="button" onClick={() => store.toggleShoppingItem(item.id)} aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`}>{item.checked && <Check aria-hidden="true" />}</button>
                      <span><strong>{item.name}</strong>{item.amountLabel && <small>{item.amountLabel}</small>}</span>
                      <a className="shop-link" href={`https://www.heb.com/search/?q=${encodeURIComponent(item.name)}`} target="_blank" rel="noreferrer">H‑E‑B <ExternalLink aria-hidden="true" /></a>
                      <button className="icon-button" type="button" onClick={() => store.deleteShoppingItem(item.id)} aria-label={`Delete ${item.name}`}><X aria-hidden="true" /></button>
                    </div>
                  ))}
                </section>
              ) : <div className="empty-state"><ShoppingBasket aria-hidden="true" /><strong>Your list is clear</strong><p>Open any recipe and add its missing products, or type an item above.</p><button className="button button--secondary" type="button" onClick={() => navigate('recipes')}>Browse recipes</button></div>}
            </div>
          )}

          {view === 'settings' && (
            <div className="page-stack page-stack--narrow">
              <section className="settings-section panel">
                <div className="section-head"><div><span className="eyebrow">Meal targets</span><h2>Guide the recipe ranking</h2><p>These are preference filters, not medical nutrition advice.</p></div></div>
                <div className="field-grid field-grid--three">
                  <label className="field"><span>Calories / serving</span><input type="number" min="100" max="2000" value={state.settings.calorieTarget} onChange={(event) => store.updateSettings({ calorieTarget: Number(event.target.value) })} /></label>
                  <label className="field"><span>Protein / serving</span><div className="unit-input"><input type="number" min="0" max="200" value={state.settings.proteinTargetG} onChange={(event) => store.updateSettings({ proteinTargetG: Number(event.target.value) })} /><span>g</span></div></label>
                  <label className="field"><span>Max cook time</span><div className="unit-input"><input type="number" min="5" max="240" value={state.settings.maxCookMinutes} onChange={(event) => store.updateSettings({ maxCookMinutes: Number(event.target.value) })} /><span>min</span></div></label>
                </div>
              </section>

              <section className="settings-section panel">
                <div className="section-head"><div><span className="eyebrow">Appearance</span><h2>Theme</h2></div></div>
                <div className="theme-picker">{(['system', 'light', 'dark'] as RecipesSettings['theme'][]).map((theme) => <button key={theme} type="button" className={state.settings.theme === theme ? 'is-active' : ''} onClick={() => store.updateSettings({ theme })}>{theme === 'system' ? <Settings2 aria-hidden="true" /> : theme === 'light' ? <Sparkles aria-hidden="true" /> : <Leaf aria-hidden="true" />}<span><strong>{theme[0].toUpperCase() + theme.slice(1)}</strong><small>{theme === 'system' ? 'Follow this device' : `${theme} palette`}</small></span>{state.settings.theme === theme && <Check aria-hidden="true" />}</button>)}</div>
              </section>

              <section className="settings-section panel">
                <div className="section-head"><div><span className="eyebrow">Private sync</span><h2>{sync.user ? 'Connected to the owner vault' : 'Keep devices together'}</h2><p>{sync.message ?? (sync.user ? 'Pantry, recipes, list, and targets sync through your private Firebase workspace.' : 'Everything already works on this device. Google sign-in adds private cross-device sync.')}</p></div><span className={`status-pill status-pill--${sync.status}`}>{statusIcon}{syncLabel}</span></div>
                <div className="sync-settings-row">
                  <div className="sync-identity"><span>{sync.user?.displayName?.slice(0, 1).toUpperCase() ?? <Cloud aria-hidden="true" />}</span><div><strong>{sync.user?.displayName ?? 'Local-first mode'}</strong><small>{sync.user?.email ?? `${store.storageMode === 'indexeddb' ? 'IndexedDB + localStorage' : 'localStorage'} on this device`}</small></div></div>
                  {sync.user ? <button className="button button--secondary" type="button" onClick={() => void sync.signOut().catch((error) => showToast(error instanceof Error ? error.message : 'Could not sign out.'))} disabled={sync.signingOut}><LogOut aria-hidden="true" /> {sync.signingOut ? 'Finishing sync…' : 'Sign out'}</button>
                    : <button className="button" type="button" onClick={() => void sync.signIn().catch((error) => showToast(error instanceof Error ? error.message : 'Could not sign in.'))}><LogIn aria-hidden="true" /> Sign in with Google</button>}
                </div>
                {store.storageWarning && <div className="notice notice--warning"><CircleAlert aria-hidden="true" /><div><strong>Storage fallback active</strong><span>{store.storageWarning}</span></div></div>}
              </section>

              <section className="settings-section panel">
                <div className="section-head"><div><span className="eyebrow">Data + portability</span><h2>Back up your kitchen</h2><p>Exports include private pantry and recipe data. Keep the JSON somewhere you trust.</p></div></div>
                <div className="data-actions"><button className="button button--secondary" type="button" onClick={exportData}><Download aria-hidden="true" /> Export JSON</button><label className="button button--secondary"><Upload aria-hidden="true" /> Import JSON<input className="sr-only" type="file" accept="application/json,.json" onChange={importData} /></label></div>
              </section>

              <section className="settings-section panel">
                <div className="section-head"><div><span className="eyebrow">Data sources</span><h2>Where product data comes from</h2></div></div>
                <div className="source-cards"><a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer"><Database aria-hidden="true" /><span><strong>USDA FoodData Central</strong><small>CC0 generic + branded nutrition</small></span><ExternalLink aria-hidden="true" /></a><a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer"><Leaf aria-hidden="true" /><span><strong>Open Food Facts</strong><small>Open packaged-product labels</small></span><ExternalLink aria-hidden="true" /></a><div><Bot aria-hidden="true" /><span><strong>Firebase AI Logic</strong><small>Signed-in drafts gated by the owner workspace; sends only selected product details, meal targets, and the chef prompt to Google</small></span></div></div>
                <p className="data-footnote">No private USDA, Gemini, retailer, or commercial API key is stored in this public app. The official USDA DEMO_KEY is used only for low-volume explicit search. Allergy information must always be checked on the package.</p>
              </section>

              <section className="danger-zone">
                <div><strong>Clear this device</strong><p>Removes only this device's local copy. A confirmed signed-in cloud copy reloads afterward.</p></div>
                <button className="button button--ghost button--danger-text" type="button" onClick={() => void resetLocalData()}><Trash2 aria-hidden="true" /> Clear local data</button>
              </section>
            </div>
          )}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {VIEWS.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'is-active' : ''} type="button" onClick={() => navigate(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span>{item.id === 'list' && state.shopping.filter((entry) => !entry.checked).length > 0 && <b>{state.shopping.filter((entry) => !entry.checked).length}</b>}</button>; })}
      </nav>

      {activeRecipe && <RecipeDialog recipe={activeRecipe} pantry={state.pantry} saved={state.recipes.some((recipe) => recipe.id === activeRecipe.id)} onClose={() => setActiveRecipe(undefined)} onSave={() => { store.saveRecipe(activeRecipe); showToast(`${activeRecipe.title} saved.`); setActiveRecipe(undefined); }} onDelete={() => { store.deleteRecipe(activeRecipe.id); showToast('Saved recipe removed.'); setActiveRecipe(undefined); }} onAddMissing={() => addMissingForRecipe(activeRecipe)} />}
      {reviewProduct && <ReviewProductDialog product={reviewProduct} onClose={() => setReviewProduct(undefined)} onApprove={approveReviewedProduct} />}
      {manualOpen && <ManualProductDialog onClose={() => setManualOpen(false)} onAdd={(product) => { addProduct(product); setManualOpen(false); }} />}
      {toast && <div className="toast" role="status"><Check aria-hidden="true" /><span>{toast}</span></div>}
      {sync.signingOut && <SignOutStatus />}
    </div>
  );
}

export default App;
