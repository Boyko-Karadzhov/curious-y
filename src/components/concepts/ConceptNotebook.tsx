import { useId } from 'react';
import { BookOpen, Check, CircleDashed, Sparkles } from 'lucide-react';
import { confirmed, DIMENSIONS, DIMENSION_ORDER, type Dimension, type VisibleNode } from '../../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES, REASONING_COMPLEXITY_INFO } from '../../../supabase/functions/_shared/reasoning';
import { MathMarkdown } from '../common/MathMarkdown';

function DimensionCard({ dimension, index, node, id }: {
    dimension: Dimension;
    index: number;
    node: VisibleNode;
    id: string
}) {
    const progress = node.progress[dimension];
    const entry = progress?.entry?.trim();
    const complete = confirmed(progress);
    const state = complete ? 'confirmed' : entry ? 'collected' : 'empty';
    const label = complete ? 'Completed' : entry ? 'Collected' : 'Not collected yet';
    return <section id={`${id}-${dimension}`} tabIndex={-1} aria-label={DIMENSIONS[dimension].label} className={`concept-dimension-card concept-dimension-${state}`}>
        <header><span className="concept-dimension-number">{String(index + 1).padStart(2, '0')}</span><h4>{DIMENSIONS[dimension].label}</h4><span className="concept-dimension-status">{label}</span></header>
        <p className="concept-dimension-description">{DIMENSIONS[dimension].description}</p>
        {entry ? <MathMarkdown className="concept-dimension-entry" content={entry} /> : <div className="concept-empty-message"><CircleDashed size={18} /><p>No insight collected yet. A correct answer adds what you discover here.</p></div>}
        <footer><span className="concept-evidence-dots" aria-hidden="true"><i className={complete ? 'earned' : ''} /></span>{complete ? '1 / 1 correct answer' : '0 / 1 correct answer'}{complete && <Check size={14} />}</footer>
    </section>;
}

function DimensionLink({ dimension, node, id }: {
    dimension: Dimension;
    node: VisibleNode;
    id: string
}) {
    const progress = node.progress[dimension];
    const state = confirmed(progress) ? 'confirmed' : progress?.entry ? 'collected' : 'empty';
    const label = state === 'confirmed' ? 'Completed' : state === 'collected' ? 'Collected' : 'Not collected yet';
    const open = (event: React.MouseEvent) => {
        event.preventDefault();
        const section = document.getElementById(`${id}-${dimension}`);
        section?.scrollIntoView({
            block: 'nearest',
            behavior: 'auto'
        });
        section?.focus({ preventScroll: true });
    };

    return <a href={`#${id}-${dimension}`} className={`concept-index-${state}`} aria-label={`${DIMENSIONS[dimension].label}: ${label}`} onClick={open}>
        <span aria-hidden="true">{state === 'confirmed' ? <Check size={14} /> : state === 'collected' ? <BookOpen size={14} /> : <CircleDashed size={14} />}</span>
        <span>{DIMENSIONS[dimension].label}<small>{label}</small></span>
    </a>;
}

function ReasoningProgress({ node }: { node: VisibleNode }) {
    const completed = REASONING_COMPLEXITIES.filter(complexity => confirmed(node.progress[complexity])).length;
    return <section className="concept-reasoning-progress" aria-label="Reasoning challenges">
        <header><Sparkles size={16} /><h4>Reasoning challenges</h4><span>{completed} / {REASONING_COMPLEXITIES.length}</span></header>
        <p>After the knowledge dimensions, solve one question at each reasoning complexity.</p>
        <div>{REASONING_COMPLEXITIES.map(complexity => <span key={complexity} className={confirmed(node.progress[complexity]) ? 'earned' : ''}>{REASONING_COMPLEXITY_INFO[complexity].name}</span>)}</div>
    </section>;
}

function BossProgress({ node }: { node: VisibleNode }) {
    const complete = confirmed(node.progress.boss);
    return <div className="concept-notebook"><div className="concept-collection-heading"><h3>Boss challenge</h3><span>{complete ? 'Completed' : 'Ready'}</span></div>
        <p className="concept-collection-note">Combine the prerequisite concepts to answer the revealed question.</p></div>;
}

/** Only earned entries are available here; private planned knowledge stays hidden. */
export function ConceptNotebook({ node }: { node: VisibleNode }) {
    const id = useId();
    if (node.kind === 'boss') {
        return <BossProgress node={node} />;
    }

    const collected = DIMENSION_ORDER.filter(dimension => node.progress[dimension]?.entry?.trim()).length;
    return <div className="concept-notebook">
        <div className="concept-collection-heading"><h3>Dimensions of understanding</h3><span>{collected} / {DIMENSION_ORDER.length} collected</span></div>
        <p className="concept-collection-note">Your knowledge grows here, one discovery at a time. Empty spaces show what is still waiting to be explored.</p>
        <nav className="concept-dimension-index" aria-label="Dimensions of understanding">{DIMENSION_ORDER.map(dimension => <DimensionLink key={dimension} dimension={dimension} node={node} id={id} />)}</nav>
        <div className="concept-dimension-pages">{DIMENSION_ORDER.map((dimension, index) => <DimensionCard key={dimension} dimension={dimension} index={index} node={node} id={id} />)}</div>
        <ReasoningProgress node={node} />
    </div>;
}
