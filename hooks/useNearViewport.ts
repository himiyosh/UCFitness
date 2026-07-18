'use client';

import { useEffect, useRef, useState } from 'react';

import type { RefObject } from 'react';

interface NearViewportResult {
    targetRef: RefObject<HTMLDivElement>;
    isNearViewport: boolean;
}

export function useNearViewport(rootMargin = '0px'): NearViewportResult {
    const targetRef = useRef<HTMLDivElement>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);

    useEffect(() => {
        if (isNearViewport) return;

        const target = targetRef.current;
        if (!target) return;
        if (!('IntersectionObserver' in window)) {
            setIsNearViewport(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsNearViewport(true);
                observer.disconnect();
            },
            { rootMargin },
        );
        observer.observe(target);

        return () => observer.disconnect();
    }, [isNearViewport, rootMargin]);

    return { targetRef, isNearViewport };
}
