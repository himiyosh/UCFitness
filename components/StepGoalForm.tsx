'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StepGoalForm({ initialGoal }: { initialGoal: number }) {
    const [goal, setGoal] = useState(initialGoal);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const res = await fetch('/api/user/step-goal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step_goal: goal }),
            });

            if (!res.ok) throw new Error('Failed to update goal');

            setIsEditing(false);
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to update step goal');
        } finally {
            setIsSaving(false);
        }
    };

    if (isEditing) {
        return (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
                <input
                    type="number"
                    value={goal}
                    onChange={(e) => setGoal(parseInt(e.target.value) || 0)}
                    className="block w-24 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
                <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                >
                    {isSaving ? '...' : 'Save'}
                </button>
                <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                >
                    Cancel
                </button>
            </form>
        );
    }

    return (
        <div className="mt-2 flex items-center gap-2">
            <span className="text-gray-900 font-medium">{goal.toLocaleString()} steps</span>
            <button
                onClick={() => setIsEditing(true)}
                className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
            >
                Edit Goal
            </button>
        </div>
    );
}
