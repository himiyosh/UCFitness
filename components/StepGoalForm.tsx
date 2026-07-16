'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';

import {
    isValidStepGoal,
    MAX_STEP_GOAL,
    MIN_STEP_GOAL,
} from '@/lib/step-goal';

import Spinner from '@/components/ui/Spinner';

interface StepGoalFormProps {
    initialGoal: number;
}

export default function StepGoalForm({ initialGoal }: StepGoalFormProps) {
    const [goal, setGoal] = useState(initialGoal);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const t = useTranslations('Settings');
    const commonT = useTranslations('Common');

    const handleCancel = useCallback(() => {
        setGoal(initialGoal);
        setError(null);
        setIsEditing(false);
    }, [initialGoal]);

    const handleGoalChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.valueAsNumber;
        setGoal(Number.isNaN(value) ? 0 : value);
        setError(null);
    }, []);

    const handleEdit = useCallback(() => {
        setSuccess(false);
        setIsEditing(true);
    }, []);

    const handleSubmit = useCallback(async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!isValidStepGoal(goal)) {
            setError(t('stepGoalRangeError', {
                min: MIN_STEP_GOAL.toLocaleString(),
                max: MAX_STEP_GOAL.toLocaleString(),
            }));
            inputRef.current?.focus();
            return;
        }

        setIsSaving(true);

        try {
            const res = await fetch('/api/user/step-goal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step_goal: goal }),
            });

            if (!res.ok) throw new Error('Failed to update goal');

            setError(null);
            setSuccess(true);
            setIsEditing(false);
            router.refresh();
        } catch {
            setError(t('stepGoalSaveError'));
        } finally {
            setIsSaving(false);
        }
    }, [goal, router, t]);

    if (isEditing) {
        return (
            <div className="mt-2">
                <form onSubmit={handleSubmit} noValidate className="flex items-center gap-2">
                    <label htmlFor="settings-step-goal" className="sr-only">
                        {t('stepGoalLabel')}
                    </label>
                    <input
                        ref={inputRef}
                        id="settings-step-goal"
                        name="step_goal"
                        type="number"
                        value={goal}
                        onChange={handleGoalChange}
                        min={MIN_STEP_GOAL}
                        max={MAX_STEP_GOAL}
                        aria-describedby={error ? 'step-goal-error' : undefined}
                        aria-invalid={error ? 'true' : undefined}
                        className={`block min-h-[44px] min-w-0 flex-1 rounded-xl border bg-[var(--color-surface)] px-3 py-2 text-base tabular-nums text-[var(--color-text)] shadow-sm focus:outline-none focus:ring-2 sm:max-w-36 sm:text-sm ${error
                            ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]'
                            : 'border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]'
                            }`}
                    />
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="flex min-h-[44px] min-w-[52px] items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-solid)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSaving ? (
                            <Spinner size="sm" />
                        ) : commonT('save')}
                    </button>
                    <button
                        type="button"
                        onClick={handleCancel}
                        disabled={isSaving}
                        className="inline-flex min-h-[44px] min-w-[52px] items-center justify-center rounded-xl px-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
                    >
                        {commonT('cancel')}
                    </button>
                </form>
                {error && (
                    <p id="step-goal-error" className="mt-1.5 text-xs text-[var(--color-danger)]" role="alert">{error}</p>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold tabular-nums text-[var(--color-text)]">
                    {goal.toLocaleString()}{' '}
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">{t('stepGoalUnit')}</span>
                </span>
                <button
                    type="button"
                    onClick={handleEdit}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                >
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3L10.58 12.42a4 4 0 01-1.343.886l-3.155 1.262a.5.5 0 01-.65-.65z" />
                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                    </svg>
                    {t('editStepGoal')}
                </button>
            </div>
            {success && (
                <p className="mt-2 text-xs font-medium text-[var(--color-success-strong)]" role="status">
                    {t('stepGoalSaveSuccess')}
                </p>
            )}
        </div>
    );
}
