import { ShoppingBasket } from 'lucide-react';
import { weekGrocery, type GroceryLine } from './week';
import type { WeekPlan } from './types';

export function WeekGrocery({
  plan,
  onAdd,
}: {
  readonly plan: WeekPlan;
  readonly onAdd: (lines: readonly GroceryLine[]) => void;
}) {
  const lines = weekGrocery(plan);
  if (!lines.length) return null;
  return (
    <section className="grocery-group planner-grocery">
      <header>
        <div><ShoppingBasket aria-hidden="true" /><h3>From this week</h3></div>
        <button className="guide-button" type="button" onClick={() => onAdd(lines)}>Add to checklist</button>
      </header>
      <div>
        {lines.map((line) => (
          <article className="grocery-row" key={line.key}>
            <div className="grocery-row__name">
              <h4>{line.name}{line.estimated ? ' · estimated' : ''}</h4>
              <p>{line.amountLabel}</p>
              <details className="planner-source">
                <summary>{line.sourceLabel}</summary>
                <p>{line.sourceNote}</p>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
