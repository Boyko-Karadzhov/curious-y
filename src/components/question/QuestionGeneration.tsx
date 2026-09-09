import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

export function QuestionGeneration({ topic, isDemo }: { topic: string | null; isDemo: boolean }) {
    const [takingLonger, setTakingLonger] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        stageRef.current?.focus({ preventScroll: true });
        stageRef.current?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        const timer = window.setTimeout(() => setTakingLonger(true), 12000);
        return () => window.clearTimeout(timer);
    }, []);

    return (
        <div ref={stageRef} tabIndex={-1} role="status" aria-live="polite" aria-label="Preparing your next question" className="question-forge scroll-mt-24">
            <div className="question-forge__topline" aria-hidden="true"><Sparkles size={14} /><span>THE QUESTION FORGE</span><span className="question-forge__live" /></div>
            <div className="question-forge__cosmos" aria-hidden="true">
                <div className="question-forge__halo" />
                <div className="question-forge__orbit question-forge__orbit--outer"><i /><i /></div>
                <div className="question-forge__orbit question-forge__orbit--inner"><i /><i /></div>
                <div className="question-forge__core"><span>?</span></div>
                {Array.from({ length: 12 }, (_, i) => <span key={i} className="question-forge__spark" style={{ '--angle': `${i * 30}deg`, '--delay': `${i * -0.3}s` } as React.CSSProperties} />)}
                <span className="question-forge__glyph question-forge__glyph--one">why</span>
                <span className="question-forge__glyph question-forge__glyph--two">what if</span>
                <span className="question-forge__glyph question-forge__glyph--three">how</span>
            </div>
            <div className="question-forge__copy">
                <p className="question-forge__eyebrow">{topic || 'A little of the unexpected'}</p>
                <h2>A new spark of curiosity.</h2>
                <p>{takingLonger ? 'Great questions take a little thought. Still working on yours…' : isDemo ? 'Choosing your next discovery…' : 'Crafting a question to make you think…'}</p>
            </div>
            <div className="question-forge__footer" aria-hidden="true"><span /><Sparkles size={13} /><span /></div>
        </div>
    );
}
