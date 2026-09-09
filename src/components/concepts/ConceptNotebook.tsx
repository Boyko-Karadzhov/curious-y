import { useId } from 'react';
import { BookOpen, Check, CircleDashed, LockKeyhole, Sparkles } from 'lucide-react';
import { FACETS, proficient, type Facet, type VisibleNode } from '../../../supabase/functions/_shared/journey';
import { MathMarkdown } from '../common/MathMarkdown';

/** Only earned entries are available here; empty dimensions never reveal private plan content. */
export function ConceptNotebook({ node }: { node: VisibleNode }) {
    const id = useId();
    const collected = node.facets.filter(facet => node.progress[facet]?.entry?.trim()).length;
    const facets: Facet[] = node.kind === 'concept' ? [...node.facets, 'advanced'] : node.facets;
    const dimensions = facets.map(facet => {
        const progress = node.progress[facet];
        const entry = progress?.entry?.trim();
        const goal = node.kind === 'boss' ? 1 : facet === 'advanced' ? 3 : 2;
        const successes = Math.min(progress?.successes ?? 0, goal);
        const locked = facet === 'advanced' && !proficient(node, node.progress);
        const state = locked ? 'locked' : !entry ? 'empty' : successes >= goal ? 'confirmed' : 'collected';
        const label = locked ? 'Locked' : !entry ? 'Not collected yet' : successes >= goal ? facet === 'advanced' || node.kind === 'boss' ? 'Completed' : 'Confirmed' : 'Collected · keep exploring';
        return { facet, entry, goal, successes, state, label };
    });

    return <div className="concept-notebook">
        <div className="concept-collection-heading"><h3>{node.kind === 'boss' ? 'Your discovery' : 'Dimensions of understanding'}</h3><span>{collected} / {node.facets.length} collected</span></div>
        <p className="concept-collection-note">Your knowledge grows here, one discovery at a time. Empty spaces show what is still waiting to be explored.</p>
        <nav className="concept-dimension-index" aria-label="Dimensions of understanding">
            {dimensions.map(({ facet, state, label }) => <a key={facet} href={`#${id}-${facet}`} className={`concept-index-${state}`} aria-label={`${FACETS[facet].label}: ${label}`} onClick={event => {
                event.preventDefault();
                const section = document.getElementById(`${id}-${facet}`);
                section?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                section?.focus({ preventScroll: true });
            }}><span aria-hidden="true">{state === 'confirmed' ? <Check size={14} /> : state === 'locked' ? <LockKeyhole size={14} /> : state === 'collected' ? <BookOpen size={14} /> : <CircleDashed size={14} />}</span><span>{FACETS[facet].label}<small>{label}</small></span></a>)}
        </nav>
        <div className="concept-dimension-pages">
            {dimensions.map(({ facet, entry, goal, successes, state, label }, index) => <section key={facet} id={`${id}-${facet}`} tabIndex={-1} aria-label={FACETS[facet].label} className={`concept-dimension-card concept-dimension-${state}`}>
                <header><span className="concept-dimension-number">{facet === 'advanced' ? <Sparkles size={16} /> : String(index + 1).padStart(2, '0')}</span><h4>{FACETS[facet].label}</h4><span className="concept-dimension-status">{label}</span></header>
                <p className="concept-dimension-description">{FACETS[facet].description}</p>
                {entry ? <MathMarkdown className="concept-dimension-entry" content={entry} /> : <div className="concept-empty-message"><CircleDashed size={18} /><p>{state === 'locked' ? 'Confirm every dimension to unlock advanced discoveries.' : 'No insight collected yet. Correct answers add what you discover here.'}</p></div>}
                <footer>{state === 'locked' ? <><LockKeyhole size={13} />Unlocks after proficiency</> : <><span className="concept-evidence-dots" aria-hidden="true">{Array.from({ length: goal }, (_, i) => <i key={i} className={i < successes ? 'earned' : ''} />)}</span>{successes} / {goal} {goal === 1 ? 'correct answer' : 'correct answers'}{state === 'confirmed' && <Check size={14} />}</>}</footer>
            </section>)}
        </div>
    </div>;
}
