import { Heart, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Recipe } from './model';
import { plateCredit, plateForRecipe, plateSrc } from './plates';
import { swipeOutcome } from './swipe';

interface SwipeDeckProps {
  readonly recipes: readonly Recipe[];
  readonly index: number;
  readonly savedIds: ReadonlySet<string>;
  readonly onOpen: (recipe: Recipe) => void;
  readonly onChoose: (recipe: Recipe) => void;
  readonly onPass: () => void;
  readonly onUndo: () => void;
  readonly onRestart: () => void;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function SwipeDeck({ recipes, index, savedIds, onOpen, onChoose, onPass, onUndo, onRestart }: SwipeDeckProps) {
  const recipe = recipes[index];
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fly, setFly] = useState<'left' | 'right' | null>(null);
  const origin = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null);
  const axisLock = useRef<'x' | 'y' | null>(null);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    setDx(0);
    setFly(null);
    setDragging(false);
    busy.current = false;
    axisLock.current = null;
    origin.current = null;
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [recipe?.id]);

  const commit = (direction: 'left' | 'right') => {
    if (!recipe || busy.current) return;
    busy.current = true;
    setFly(direction);
    const wait = reduceMotion.current ? 0 : 230;
    timer.current = window.setTimeout(() => {
      busy.current = false;
      setFly(null);
      setDx(0);
      if (direction === 'right') onChoose(recipe);
      else onPass();
    }, wait);
  };

  if (!recipe) {
    return (
      <div className="deck-end">
        <h2>That's the stack</h2>
        <p>Every meal in this filter has gone by. Start over, or loosen a filter.</p>
        <button className="primary-button" type="button" onClick={onRestart}>Start over</button>
      </div>
    );
  }

  const upcoming = recipes.slice(index, index + 3);
  const cookOpacity = Math.min(1, Math.max(0, dx / 90));
  const skipOpacity = Math.min(1, Math.max(0, -dx / 90));
  const saved = savedIds.has(recipe.id);

  return (
    <div className="deck-wrap">
      <div
        className="deck"
        tabIndex={0}
        role="group"
        aria-roledescription="swipe stack"
        aria-label={`${recipe.title}, ${index + 1} of ${recipes.length}. Arrow left passes, arrow right keeps it.`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); commit('left'); }
          if (event.key === 'ArrowRight') { event.preventDefault(); commit('right'); }
        }}
      >
        {upcoming.slice().reverse().map((item, reverseIndex) => {
          const depth = upcoming.length - 1 - reverseIndex;
          const top = depth === 0;
          const itemPlate = plateForRecipe(item);
          const rotation = top ? (fly === 'left' ? -8 : fly === 'right' ? 8 : dx / 22) : 0;
          const shift = top ? (fly === 'left' ? '-120%' : fly === 'right' ? '120%' : `${dx}px`) : '0px';
          return (
            <article
              key={item.id}
              className={`deck-card${top ? ' is-top' : ''}`}
              aria-hidden={top ? undefined : true}
              style={{
                zIndex: 10 - depth,
                transform: top
                  ? `translateX(${shift}) rotate(${rotation}deg)`
                  : `translateY(${depth * 14}px) scale(${1 - depth * 0.045})`,
                transition: top && dragging ? 'none' : 'transform 220ms ease',
              }}
              onPointerDown={top ? (event) => {
                if (event.button !== 0 || busy.current) return;
                if ((event.target as HTMLElement).closest('a, button')) return;
                origin.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, pointerId: event.pointerId };
                axisLock.current = null;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
              } : undefined}
              onPointerMove={top ? (event) => {
                const start = origin.current;
                if (!start || start.pointerId !== event.pointerId) return;
                const nextX = event.clientX - start.x;
                const nextY = event.clientY - start.y;
                if (!axisLock.current) {
                  if (Math.abs(nextX) < 8 && Math.abs(nextY) < 8) return;
                  axisLock.current = Math.abs(nextY) > Math.abs(nextX) ? 'y' : 'x';
                  if (axisLock.current === 'y') {
                    origin.current = null;
                    setDragging(false);
                    return;
                  }
                }
                if (axisLock.current !== 'x') return;
                event.preventDefault();
                setDx(nextX);
              } : undefined}
              onPointerUp={top ? (event) => {
                const start = origin.current;
                origin.current = null;
                axisLock.current = null;
                setDragging(false);
                if (!start || start.pointerId !== event.pointerId || busy.current) return;
                const distance = event.clientX - start.x;
                const elapsed = Math.max(1, event.timeStamp - start.t);
                const outcome = swipeOutcome(distance, distance / elapsed);
                if (outcome === 'stay') { setDx(0); return; }
                commit(outcome);
              } : undefined}
              onPointerCancel={top ? () => { origin.current = null; axisLock.current = null; setDragging(false); setDx(0); } : undefined}
            >
              <div className="deck-photo">
                <img src={plateSrc(itemPlate)} alt={top ? itemPlate.alt : ''} draggable={false} />
                {top && (
                  <>
                    <span className="deck-stamp deck-stamp--cook" style={{ opacity: fly === 'right' ? 1 : cookOpacity }}>Like</span>
                    <span className="deck-stamp deck-stamp--skip" style={{ opacity: fly === 'left' ? 1 : skipOpacity }}>Nope</span>
                  </>
                )}
              </div>
              {top && (
                <div className="deck-bio">
                  <p className="deck-card__meta">{item.cuisine} · {item.tags[2] ?? 'vegetarian'} · {item.prepMinutes + item.cookMinutes} min</p>
                  <h2>{item.title}</h2>
                  <p className="deck-card__macros">{formatNumber(item.nutritionPerServing.calories)} kcal · {formatNumber(item.nutritionPerServing.proteinG)}g protein</p>
                  <a href={itemPlate.source} target="_blank" rel="noreferrer" title={`${itemPlate.artist}, ${itemPlate.license}`}>{plateCredit(itemPlate)}</a>
                  <button type="button" className="deck-details" onClick={() => onOpen(item)}>Open recipe</button>
                  {saved ? <p className="deck-kept">Already in Saved</p> : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="deck-count">{recipes.length - index} left in this filter</p>
      <div className="deck-actions">
        <button className="deck-round deck-round--undo" type="button" aria-label="Undo" onClick={onUndo} disabled={index === 0 || fly !== null}><RotateCcw aria-hidden="true" /></button>
        <button className="deck-round deck-round--nope" type="button" aria-label="Pass" onClick={() => commit('left')}><X aria-hidden="true" /></button>
        <button className="deck-round deck-round--like" type="button" aria-label="Like" onClick={() => commit('right')}><Heart aria-hidden="true" /></button>
      </div>
      <p className="deck-hint">Swipe right to keep it, left to pass. Open recipe if you want the steps first.</p>
    </div>
  );
}
