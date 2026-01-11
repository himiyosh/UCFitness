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
        <div className="flex items-center justify-between gap-2">
            <span className="text-xl font-bold text-gray-900">{goal.toLocaleString()} <span className="text-xs font-medium text-gray-500">steps</span></span>
            <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-200 transition-colors inline-flex items-center gap-1"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3L10.58 12.42a4 4 0 01-1.343.886l-3.155 1.262a.5.5 0 01-.65-.65z" />
                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                </svg>
                Edit
            </button>
        </div>
    );
}
