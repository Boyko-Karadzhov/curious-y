import { ArrowRight, BookOpen, ChevronRight, Compass, Layers, List, Loader2, Network, Search } from 'lucide-react';
import { TOPICS } from '../../types';
import { proficient, conceptMastery, type JourneyTarget } from '../../../supabase/functions/_shared/journey';
import { ConceptNotebook } from './ConceptNotebook';
import { TopicSelectionPrompt } from '../home/TopicSelectionPrompt';
import { JourneyGraph } from './JourneyGraph';
import { statusLabel } from './journeyLabels';
import { useJourneyExplorerState } from './useJourneyExplorerState';
import './journey.css';

interface Props {
  userId: string; isDemo: boolean; topic: string; revision: number;
  onTopic: (topic: string) => void;
  onStart: (topic?: string, target?: JourneyTarget) => void;
  disabled?: boolean;
  knowledgeOnly?: boolean;
}
export function JourneyExplorer({ userId, isDemo, topic, revision, onTopic, onStart, disabled, knowledgeOnly }: Props) {
    const { journey, selected, search, setSearch, list, setList, loading, error, setReload, detailsOpen,
        setDetailsOpen, detailId, detailToggle, selectConcept, node, nodes } = useJourneyExplorerState(userId, isDemo, revision);
    return <section className="journey" aria-label={knowledgeOnly ? 'Your knowledge graph' : 'Learn'}>
        <header className="journey-heading"><div><span className="journey-eyebrow"><Compass size={14} /> FOLLOW YOUR CURIOSITY</span>
            <h1>{knowledgeOnly ? 'Your knowledge graph' : 'What will you discover?'}</h1>
            <p>{knowledgeOnly ? 'Concepts, challenges, and the connections between them.' : 'Choose a topic or let curiosity choose. Each question takes your understanding a step further.'}</p>
        </div></header>
        {error && <div role="alert" className="journey-error">{error}<button onClick={() => setReload(x => x + 1)}>Retry</button></div>}
        {loading ? <div className="journey-loading" role="status"><Loader2 className="animate-spin" /> Loading your knowledge…</div> : !knowledgeOnly ? <>
            <TopicSelectionPrompt onSelectTopic={onStart} isLoading={disabled || !!error} />
            {isDemo && <p className="journey-evidence-note">Explorer Demo has a fixed set of sample discoveries. Sign in to generate new concepts across each topic.</p>}
        </> : journey && <>
            <div className="journey-toolbar">
                <label className="journey-search"><Search size={15} /><input aria-label="Search revealed concepts" placeholder="Find a concept across all topics" value={search} onChange={e => setSearch(e.target.value)} /></label>
                <label className="journey-topic">Get a question<select aria-label="Practice topic" value={topic} onChange={e => onTopic(e.target.value)} disabled={disabled}>
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                </select></label>
                <button className="journey-primary" disabled={disabled} onClick={() => onStart(topic)}>Practice topic<ArrowRight size={16} /></button>
                <div className="journey-view-toggle"><button aria-label="Graph view" aria-pressed={!list} onClick={() => setList(false)}><Network size={17} /></button><button aria-label="List view" aria-pressed={list} onClick={() => setList(true)}><List size={17} /></button></div>
                {node && <button ref={detailToggle} className="journey-detail-toggle" aria-expanded={detailsOpen} aria-controls={detailId} onClick={() => setDetailsOpen(open => !open)}><BookOpen size={16} />{detailsOpen ? 'Hide concept page' : 'Show concept page'}</button>}
            </div>
            <div className={`journey-workspace ${detailsOpen && node ? 'journey-workspace-open' : ''}`}>
                {nodes.length === 0 ? <div className="journey-empty"><Search size={28} /><strong>{search ? 'No matching concepts.' : 'Your graph starts with your first discovery.'}</strong><p>Choose a topic to begin exploring.</p></div>
                    : list ? <div className="journey-list" aria-label="Revealed concepts">{nodes.map(n => <button key={n.id} onClick={() => selectConcept(n.id)} aria-pressed={n.id === selected}>
                        <span className="journey-node-orb"><Layers /></span><span><strong>{n.title}</strong><small>{n.topic} · {statusLabel(n)}{n.kind === 'concept' ? ` · ${conceptMastery(n)}% toward mastery` : ''}</small></span><ArrowRight size={16} />
                    </button>)}</div> : <JourneyGraph journey={journey} visibleIds={nodes.map(n => n.id)} selected={selected} onSelect={selectConcept} onBackgroundClick={() => setDetailsOpen(false)} />}
                {detailsOpen && node && <aside key={node.id} id={detailId} className="journey-detail" aria-label="Concept details">
                    {node ? <>
                        <div className="journey-detail-heading"><span className="journey-eyebrow"><BookOpen size={14} /> CONCEPT NOTEBOOK</span><button aria-label="Collapse concept page" aria-expanded={true} aria-controls={detailId} title="Collapse to explore the graph" onClick={() => {
                            setDetailsOpen(false); detailToggle.current?.focus();
                        }}><ChevronRight size={20} /></button></div>
                        <span className="journey-concept-topic">{node.topic}</span><h2>{node.title}</h2>
                        <span className={`journey-status journey-status-${node.status}`}>{statusLabel(node)}</span>
                        {node.kind === 'concept' && <div className="journey-mastery"><strong>{conceptMastery(node)}% toward mastery</strong><progress aria-label={`${node.title} mastery`} max={100} value={conceptMastery(node)} /><p>Confirm all seven dimensions, then solve three advanced challenges.</p></div>}
                        <p className="journey-evidence-note">{node.kind === 'boss' ? node.status === 'completed' ? 'Challenge conquered.' : 'Your prerequisites are proficient. Put them together to answer this question.' : proficient(node, node.progress) ? node.status === 'mastered' ? 'Mastered. Keep your understanding fresh with practice.' : 'Proficient. Advanced questions deepen your mastery.' : 'Each question builds on the last. Your next step is chosen automatically.'}</p>
                        <button className="journey-primary" disabled={disabled || node.status === 'completed'} onClick={() => onStart(node.topic, node.target)}>{node.kind === 'boss' ? node.status === 'completed' ? 'Boss conquered' : 'Answer this boss' : 'Practice this concept'}<ArrowRight size={16} /></button>
                        <ConceptNotebook node={node} />
                        {node.requires.length > 0 && <div className="journey-connections"><strong>Built on your understanding of</strong>{node.requires.map(r => <button key={r.nodeId} onClick={() => selectConcept(r.nodeId)}>{journey.nodes.find(n => n.id === r.nodeId)?.title}<ArrowRight size={12} /></button>)}</div>}
                    </> : <p>Select a concept to explore it.</p>}
                </aside>}
            </div>
        </>}
    </section>;
}
