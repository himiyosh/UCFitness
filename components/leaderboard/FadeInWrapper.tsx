'use client';

import { useState, useEffect } from 'react';

import type { ReactNode } from 'react';

export default function FadeInWrapper({ children, className = "" }: { children: ReactNode, className?: string }) {
    const [show, setShow] = useState(false);
    const [animationDone, setAnimationDone] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setShow(true);
                // アニメーション完了後に transform を解除 — transform 祖先は position:fixed を壊すため
                setTimeout(() => setAnimationDone(true), 750);
            });
        });
    }, []);

    // transform が残っていると子孫の position:fixed が viewport ではなく transform 祖先基準になる
    const animClasses = animationDone
        ? ''
        : `transition-all duration-700 ease-in-out transform ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`;

    return (
        <div className={`${className} ${animClasses}`}>
            {children}
        </div>
    );
}
