import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Nutrition } from '../model';
import { DAILY_TARGETS, LEDGER_KEYS, LEDGER_LABELS, LEDGER_UNITS, ledgerTone } from './macros';
import { MealDrawer } from './MealDrawer';
import {
  eatOutSlot,
  emptySlot,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  recipeSlot,
  type MealSlotId,
  type WeekPlan,
} from './types';
import {
  averageLedger,
  defaultWeekPlan,
  formatDayLabel,
  ledgerRows,
  replaceSlot,
  resolveMeal,
  sumLedgers,
  weekLedgers,
} from './week';
import './planner.css';

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function signed(value: number, digits = 0): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  const text = formatNumber(Math.abs(rounded), digits);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `-${text}`;
  return text;
}

export function PlannerView({
  plan,
  onPlanChange,
}: {
  readonly plan: WeekPlan;
  readonly onPlanChange: (plan: WeekPlan) => void;
}) {
  const ledgers = useMemo(() => weekLedgers(plan), [plan]);
  const weekTotal = useMemo(() => sumLedgers(ledgers), [ledgers]);
  const plannedLedgers = ledgers.filter((ledger) => !ledger.flex);
  const plannedAverage = useMemo(
    () => averageLedger(sumLedgers(plannedLedgers), plannedLedgers.length),
    [plannedLedgers],
  );
  const [openDate, setOpenDate] = useState(plan.days[0]?.date ?? '');
  const [active, setActive] = useState<{ date: string; slotId: MealSlotId; mode: 'meal' | 'swap' | 'eat-out' }>();

  const activeDay = plan.days.find((day) => day.date === active?.date);
  const activeSlot = active && activeDay ? activeDay.slots[active.slotId] : undefined;
  const activeMeal = activeSlot?.kind === 'recipe' ? resolveMeal(activeSlot.recipeId) : undefined;
  const activeIndex = active ? plan.days.findIndex((day) => day.date === active.date) : -1;

  return (
    <div className="planner">
      <section className="planner-hero">
        <div>
          <span className="hero-kicker">Week of Oct 12</span>
          <h2>Breakfast, lunch, and snacks</h2>
          <p>
            Daily targets are {DAILY_TARGETS.calories} kcal, {DAILY_TARGETS.proteinG} g protein, {DAILY_TARGETS.carbsG} g carbs, {DAILY_TARGETS.fatG} g fat, and {DAILY_TARGETS.fiberG} g fiber.
            Eat-out slots stay out of the totals.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            if (window.confirm('Replace this week with the default plan?')) onPlanChange(defaultWeekPlan());
          }}
        >
          <RotateCcw aria-hidden="true" /> Reset to default week
        </button>
      </section>

      <section className="planner-sticky" aria-label="Week macro summary">
        <div><span>Logged kcal</span><strong>{formatNumber(weekTotal.calories)}</strong></div>
        <div><span>Protein</span><strong>{formatNumber(weekTotal.proteinG, 0)} g</strong></div>
        <div><span>Planned-day avg</span><strong>{formatNumber(plannedAverage.calories)} kcal</strong></div>
        <div><span>Avg protein</span><strong>{formatNumber(plannedAverage.proteinG, 0)} g</strong></div>
      </section>

      <div className="week-grid">
        {plan.days.map((day, index) => {
          const ledger = ledgers[index];
          const label = formatDayLabel(day.date, index);
          const open = openDate === day.date;
          return (
            <article className={`day-card${open ? ' is-open' : ''}${ledger.flex ? ' is-flex' : ''}`} key={day.date}>
              <button className="day-card__toggle" type="button" aria-expanded={open} onClick={() => setOpenDate(open ? '' : day.date)}>
                <span>{label.weekday}</span>
                <strong>{label.monthDay}</strong>
                <small>{ledger.flex ? 'Flex lunch' : `${formatNumber(ledger.nutrition.calories)} kcal`}</small>
              </button>
              <div className="day-card__body">
                {MEAL_SLOTS.map((slotId) => {
                  const slot = day.slots[slotId];
                  const meal = slot.kind === 'recipe' ? resolveMeal(slot.recipeId) : undefined;
                  const suggestion = slot.kind === 'recipe' && slot.suggestion === true;
                  return (
                    <button
                      className="slot-button"
                      type="button"
                      key={slotId}
                      onClick={() => setActive({ date: day.date, slotId, mode: slot.kind === 'empty' ? 'swap' : 'meal' })}
                    >
                      <span>{MEAL_SLOT_LABELS[slotId]}</span>
                      <strong>
                        {slot.kind === 'empty' && 'Add a meal'}
                        {slot.kind === 'eat-out' && 'Eat out'}
                        {meal && meal.title}
                        {slot.kind === 'recipe' && !meal && 'Missing recipe'}
                      </strong>
                      <small>
                        {meal ? `${formatNumber(meal.nutrition.calories)} kcal · ${formatNumber(meal.nutrition.proteinG, 0)} g protein` : slot.kind === 'eat-out' ? 'Flex, not in the total' : 'Empty'}
                        {suggestion ? ' · suggestion' : ''}
                        {meal?.estimated ? ' · estimated' : ''}
                      </small>
                    </button>
                  );
                })}
                <Ledger nutrition={ledger.nutrition} flex={ledger.flex} />
              </div>
            </article>
          );
        })}
      </div>

      <section className="week-totals" aria-label="Weekly totals">
        <header>
          <h3>Week totals</h3>
          <p>Sums include every logged breakfast, lunch, and snack. Tuesday&apos;s eat-out lunch is omitted. The planned-day average skips that flex day.</p>
        </header>
        <div className="week-totals__grid">
          <div className="ledger" aria-label="Logged sum">
            <h4>Logged sum</h4>
            <p className="planner-muted">Includes Tuesday breakfast and snacks. The eat-out lunch is omitted, so this sum is not six full days.</p>
            {LEDGER_KEYS.map((key) => (
              <div className="ledger-row" key={`sum-${key}`}>
                <div className="ledger-row__label">
                  <span>{LEDGER_LABELS[key]}</span>
                  <strong>{formatNumber(weekTotal[key], key === 'calories' ? 0 : 1)} {LEDGER_UNITS[key]}</strong>
                </div>
              </div>
            ))}
          </div>
          <Ledger nutrition={plannedAverage} flex={false} heading="Planned-day average" />
        </div>
      </section>

      {active && activeSlot && (
        <MealDrawer
          slotLabel={`${formatDayLabel(active.date, Math.max(0, activeIndex)).weekday} ${MEAL_SLOT_LABELS[active.slotId]}`}
          meal={activeMeal}
          eatOutNote={activeSlot.kind === 'eat-out' ? activeSlot.note : undefined}
          suggestion={activeSlot.kind === 'recipe' && activeSlot.suggestion === true}
          mode={active.mode}
          onClose={() => setActive(undefined)}
          onSwap={(recipeId) => {
            const suggestion = activeSlot.kind === 'recipe' && activeSlot.suggestion === true;
            onPlanChange(replaceSlot(plan, active.date, active.slotId, recipeSlot(recipeId, suggestion)));
            setActive(undefined);
          }}
          onClear={() => {
            onPlanChange(replaceSlot(plan, active.date, active.slotId, emptySlot()));
            setActive(undefined);
          }}
          onEatOut={(note) => {
            onPlanChange(replaceSlot(plan, active.date, active.slotId, eatOutSlot(note)));
            setActive(undefined);
          }}
        />
      )}
    </div>
  );
}

function Ledger({
  nutrition,
  flex,
  heading,
  targets = DAILY_TARGETS,
}: {
  readonly nutrition: Nutrition;
  readonly flex: boolean;
  readonly heading?: string;
  readonly targets?: Readonly<Record<keyof typeof DAILY_TARGETS, number>>;
}) {
  return (
    <div className="ledger" aria-label={heading ?? 'Day ledger'}>
      {heading && <h4>{heading}</h4>}
      {flex && <p className="ledger__flex">Eat-out lunch is not in these totals.</p>}
      {ledgerRows(nutrition, targets).map((row) => {
        const tone = ledgerTone(row.actual, row.target);
        const width = Math.max(0, Math.min(100, row.target === 0 ? 0 : (row.actual / row.target) * 100));
        const digits = row.key === 'calories' ? 0 : 1;
        return (
          <div className={`ledger-row ledger-row--${tone}`} key={`${heading ?? 'day'}-${row.key}`}>
            <div className="ledger-row__label">
              <span>{LEDGER_LABELS[row.key]}</span>
              <strong>{formatNumber(row.actual, digits)} {LEDGER_UNITS[row.key]}</strong>
            </div>
            <div className="ledger-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
            <small>{signed(row.actual - row.target, digits)} vs {formatNumber(row.target, 0)}</small>
          </div>
        );
      })}
    </div>
  );
}
