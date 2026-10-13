import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STARTER_RECIPES } from '../catalog';
import { containsBlockedDietTerm } from '../diet';
import { PLANNER_RECIPES } from './recipes';
import { MEAL_SLOT_LABELS, type MealSlotId } from './types';
import type { ResolvedMeal } from './week';

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits === 0 ? 0 : 0 }).format(value);
}

export function MealDrawer({
  slotLabel,
  meal,
  eatOutNote,
  suggestion,
  mode,
  onClose,
  onSwap,
  onClear,
  onEatOut,
}: {
  readonly slotLabel: string;
  readonly meal?: ResolvedMeal;
  readonly eatOutNote?: string;
  readonly suggestion: boolean;
  readonly mode: 'meal' | 'swap' | 'eat-out';
  readonly onClose: () => void;
  readonly onSwap: (recipeId: string) => void;
  readonly onClear: () => void;
  readonly onEatOut: (note: string) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState(eatOutNote ?? 'Vegetarian order. Macros are flex and stay out of the logged total.');
  const [noteError, setNoteError] = useState('');
  const [panel, setPanel] = useState(mode);

  useEffect(() => { setPanel(mode); }, [mode]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const appRoot = document.getElementById('root');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const rootWasInert = appRoot?.inert ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    const focusable = () => dialog
      ? [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      : [];
    const focusFirst = () => {
      const preferred = dialog?.querySelector<HTMLElement>('[data-dialog-initial-focus]');
      (preferred ?? dialog)?.focus({ preventScroll: true });
    };
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

  useEffect(() => {
    if (panel !== 'swap' && panel !== 'eat-out') return;
    dialogRef.current?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus({ preventScroll: true });
  }, [panel]);

  const normalized = query.trim().toLowerCase();
  const plannerMatches = useMemo(() => PLANNER_RECIPES.filter((recipe) => {
    if (!normalized) return true;
    return `${recipe.title} ${recipe.cuisine} ${recipe.tags.join(' ')}`.toLowerCase().includes(normalized);
  }), [normalized]);
  const catalogMatches = useMemo(() => STARTER_RECIPES.filter((recipe) => {
    if (!normalized) return false;
    return `${recipe.title} ${recipe.cuisine} ${recipe.tags.join(' ')}`.toLowerCase().includes(normalized);
  }).slice(0, 20), [normalized]);

  return createPortal(
    <div className="dialog-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="buying-dialog planner-drawer" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="buying-dialog__header">
          <div>
            <span className="eyebrow">{slotLabel}</span>
            <h2 id={titleId}>{panel === 'swap' ? 'Choose a recipe' : panel === 'eat-out' ? 'Eat out' : meal?.title ?? 'Open slot'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </header>
        <div className="buying-dialog__body">
          {panel === 'meal' && meal && <MealBody meal={meal} suggestion={suggestion} />}
          {panel === 'meal' && !meal && eatOutNote && (
            <div className="planner-callout">
              <strong>Flex meal</strong>
              <p>{eatOutNote}</p>
              <p>This slot stays out of the day ledger. Order vegetarian only: eggs and dairy are fine, and skip meat, fish, gelatin, and animal stock.</p>
            </div>
          )}
          {panel === 'meal' && !meal && !eatOutNote && <p className="planner-muted">This slot is open. Add a recipe or mark it as eat-out.</p>}
          {panel === 'swap' && (
            <div className="planner-swap">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search week recipes or the catalog" aria-label="Search recipes" data-dialog-initial-focus={panel === 'swap' ? '' : undefined} />
              <ul>
                {plannerMatches.map((recipe) => (
                  <li key={recipe.id}>
                    <button type="button" onClick={() => onSwap(recipe.id)}>
                      <span>{recipe.title}{recipe.estimated ? ' · estimated' : ''}</span>
                      <small>{formatNumber(recipe.nutritionPerServing.calories)} kcal · {formatNumber(recipe.nutritionPerServing.proteinG, 1)} g protein</small>
                    </button>
                  </li>
                ))}
                {catalogMatches.map((recipe) => (
                  <li key={recipe.id}>
                    <button type="button" onClick={() => onSwap(recipe.id)}>
                      <span>{recipe.title}</span>
                      <small>Catalog · {formatNumber(recipe.nutritionPerServing.calories)} kcal</small>
                    </button>
                  </li>
                ))}
              </ul>
              {normalized && catalogMatches.length === 0 && plannerMatches.length === 0 && <p className="planner-muted">No recipes match that search.</p>}
              {!normalized && <p className="planner-muted">Type to search the 100 substantial catalog meals. Those plates are 800 kcal and up, so check the day ledger after a swap.</p>}
            </div>
          )}
          {panel === 'eat-out' && (
            <form className="planner-eatout" onSubmit={(event) => {
                event.preventDefault();
                const nextNote = note.trim() || 'Vegetarian order. Macros are flex and stay out of the logged total.';
                if (containsBlockedDietTerm(nextNote)) {
                  setNoteError('That note crosses the vegetarian boundary, so it was not saved.');
                  noteRef.current?.focus();
                  return;
                }
                setNoteError('');
                onEatOut(nextNote);
              }}>
              <label>
                <span>Note</span>
                <textarea ref={noteRef} value={note} onChange={(event) => { setNote(event.target.value); setNoteError(''); }} rows={4} data-dialog-initial-focus={panel === 'eat-out' ? '' : undefined} aria-invalid={noteError ? true : undefined} aria-describedby={noteError ? errorId : undefined} />
              </label>
              {noteError && <p className="ledger__flex" id={errorId} role="alert">{noteError}</p>}
              <p className="planner-muted">Eat-out meals are excluded from the day totals. Keep the order vegetarian.</p>
              <button className="primary-button" type="submit">Save eat-out slot</button>
            </form>
          )}
          <div className="planner-drawer__actions">
            <button className="secondary-button" type="button" onClick={() => setPanel('swap')}>Swap recipe</button>
            <button className="secondary-button" type="button" onClick={() => setPanel('eat-out')}>Mark eat-out</button>
            <button className="secondary-button" type="button" onClick={onClear}>Clear slot</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function MealBody({ meal, suggestion }: { meal: ResolvedMeal; suggestion: boolean }) {
  const nutrition = meal.nutrition;
  return (
    <div className="planner-meal">
      <div className="planner-meal__flags">
        {suggestion && <span className="planner-badge planner-badge--suggestion">Suggestion</span>}
        {meal.estimated && <span className="planner-badge planner-badge--estimated">Estimated</span>}
        <span className="planner-badge">{meal.cuisine}</span>
      </div>
      <p>{meal.description}</p>
      <div className="planner-meal__macros" aria-label="Per serving macros">
        <span><b>{formatNumber(nutrition.calories)}</b> kcal</span>
        <span><b>{formatNumber(nutrition.proteinG, 1)}</b> g protein</span>
        <span><b>{formatNumber(nutrition.carbsG, 1)}</b> g carbs</span>
        <span><b>{formatNumber(nutrition.fatG, 1)}</b> g fat</span>
        <span><b>{formatNumber(nutrition.fiberG, 1)}</b> g fiber</span>
      </div>
      <h3>Ingredients</h3>
      <ul className="planner-ingredients">
        {meal.ingredients.map((ingredient) => (
          <li key={`${ingredient.name}-${ingredient.amountLabel}`}>
            <div>
              <strong>{ingredient.name}</strong>
              <span>{ingredient.amountLabel}{ingredient.estimated ? ' · estimated' : ''}</span>
            </div>
            <p>
              {ingredient.sourceLabel}
              {ingredient.sourceUrl && <> · <a href={ingredient.sourceUrl} target="_blank" rel="noreferrer">source</a></>}
            </p>
            <p>{ingredient.sourceNote}</p>
          </li>
        ))}
      </ul>
      <h3>Steps</h3>
      <ol className="method-list">
        {meal.steps.map((step, index) => <li key={`${meal.id}-step-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}
      </ol>
    </div>
  );
}

export function slotButtonLabel(slotId: MealSlotId): string {
  return MEAL_SLOT_LABELS[slotId];
}
