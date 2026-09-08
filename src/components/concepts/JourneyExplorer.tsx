import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Compass, Focus, Layers, List, Loader2, LockKeyhole, Minus, Network, Plus, Search, Sparkles } from 'lucide-react';
import { TOPICS } from '../../types';
import { FACETS, confirmed, nextFacet, proficient, reviewDue, type Facet, type JourneyTarget, type JourneyView, type VisibleNode } from '../../../supabase/functions/_shared/journey';
import { getServerJourney, nextServerJourney } from '../../services/backend';
import { demoJourneyView } from '../../lib/kingdom/demoLearning';
import { MathMarkdown } from '../common/MathMarkdown';
import './journey.css';

interface Props {
  userId: string; isDemo: boolean; topic: string; revision: number;
  onTopic: (topic: string) => void;
  onStart: (topic: string, target: JourneyTarget) => void;
  disabled?: boolean;
  knowledgeOnly?: boolean;
}
type Filter = 'all' | 'next' | 'knowledge' | 'review';
const statusLabel = (n: VisibleNode) => n.rusty ? `${n.status} · ready to refresh` : n.kind === 'boss' ? n.status === 'completed' ? 'Conquered' : 'Challenge revealed' : n.status === 'discovered' ? 'Ready to explore' : n.status;
const isDue = (n: VisibleNode) => n.rusty;

export function JourneyExplorer({ userId, isDemo, topic, revision, onTopic, onStart, disabled, knowledgeOnly }: Props) {
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [selected, setSelected] = useState('');
  const [facet, setFacet] = useState<Facet | null>(null);
  const [filter, setFilter] = useState<Filter>(knowledgeOnly ? 'knowledge' : 'all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [chapters, setChapters] = useState<{ id: string; chapter: number }[]>([]);
  const [chapterId, setChapterId] = useState<string | undefined>();
  const request = useRef(0);
  const invalidateRequest = useCallback(() => { request.current++; }, []);
  useEffect(() => { setChapterId(undefined); setChapters([]); setSearch(''); }, [topic]);
  useEffect(() => {
    const token = ++request.current;
    setLoading(true); setError(''); setJourney(null);
    const load = async () => {
      try {
        const result = isDemo ? demoJourneyView(userId, topic) : await getServerJourney(topic, chapterId);
        if (token !== request.current) return;
        setJourney(result); setSelected(previous => result.nodes.some(n => n.id === previous) ? previous : result.nodes[0]?.id ?? ''); setFacet(null);
        setChapters(old => result.chapters ?? (old.some(c => c.id === result.id) ? old : [...old, { id: result.id, chapter: result.chapter }]));
      } catch (err) { if (token === request.current) setError(err instanceof Error ? err.message : 'Could not load your journey.'); }
      finally { if (token === request.current) setLoading(false); }
    };
    void load();
    return invalidateRequest;
  }, [userId, isDemo, topic, revision, reload, chapterId, invalidateRequest]);
  useEffect(() => {
    const refresh = () => setReload(x => x + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const openNext = async () => {
    if (!journey || loading || disabled) return;
    const token = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await nextServerJourney(topic, journey.id);
      if (token !== request.current) return;
      setJourney(result); setChapterId(result.id); setFacet(null); setSelected(result.nodes[0]?.id ?? '');
    } catch (err) { if (token === request.current) setError(err instanceof Error ? err.message : 'Could not open the next chapter.'); }
    finally { if (token === request.current) setLoading(false); }
  };
  const node = journey?.nodes.find(n => n.id === selected);
  const currentFacet = node ? facet && (node.facets.includes(facet) || facet === 'advanced' && proficient(node, node.progress)) ? facet : nextFacet(node) : null;
  const matches = (n: VisibleNode) => n.title.toLowerCase().includes(search.toLowerCase())
    && (filter === 'all' || filter === 'next' && n.status !== 'mastered' && n.status !== 'completed'
      || filter === 'knowledge' && n.facets.some(f => n.progress[f]?.entry) || filter === 'review' && isDue(n));
  const nodes = journey?.nodes.filter(matches) ?? [];
  const select = (id: string) => { setSelected(id); setFacet(null); };
  const entries = journey?.nodes.reduce((total, n) => total + n.facets.filter(f => n.progress[f]?.entry).length, 0) ?? 0;
  const recommended = journey?.nodes.find(n => n.kind === 'boss' && n.status !== 'completed')
    ?? journey?.nodes.find(isDue) ?? journey?.nodes.find(n => n.status === 'proficient') ?? journey?.nodes.find(n => n.status === 'exploring') ?? journey?.nodes.find(n => n.status === 'discovered') ?? journey?.nodes.find(isDue) ?? journey?.nodes[0];

  return <section className="journey" aria-label={knowledgeOnly ? 'Your knowledge base' : 'Learning journey'}>
    <header className="journey-heading">
      <div><span className="journey-eyebrow"><Compass size={14} /> YOUR DISCOVERY JOURNEY</span>
        <h1>{knowledgeOnly ? 'Your growing knowledge' : journey?.title ?? 'Follow your curiosity'}</h1>
        <p>Think. Make a choice. Find a connection.</p></div>
      <label className="journey-topic">Explore a world<select aria-label="Journey topic" value={topic} onChange={e => onTopic(e.target.value)} disabled={disabled}>
        {TOPICS.map(t => <option key={t}>{t}</option>)}
      </select></label>
    </header>
    <div className="journey-summary">
      <div className="journey-mystery-icon"><Sparkles size={22} /></div>
      <div><strong>{journey?.complete ? 'You connected the ideas.' : 'A bigger question is waiting.'}</strong>
        <p>{journey?.complete ? 'Keep deepening your knowledge, or follow your curiosity into the next chapter.' : 'Explore the concepts you can see. Confirm your understanding to discover what they connect to.'}</p></div>
      <span className="journey-entry-count"><BookOpen size={16} /> {entries} knowledge {entries === 1 ? 'entry' : 'entries'}</span>
    </div>
    {error && <div role="alert" className="journey-error">{error}<button onClick={() => setReload(x => x + 1)}>Retry journey</button></div>}
    {loading ? <div className="journey-loading" role="status"><Loader2 className="animate-spin" /> {journey ? 'Discovering your next chapter…' : 'Opening your saved journey…'}</div> : journey && <>
      <div className="journey-toolbar">
        <label className="journey-search"><Search size={15} /><input aria-label="Search revealed concepts" placeholder="Find a revealed concept" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <select aria-label="Filter concepts" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          <option value="all">All discoveries</option><option value="next">Ready to explore</option><option value="knowledge">Knowledge entries</option><option value="review">Ready to revisit</option>
        </select>
        {chapters.length > 1 && <select aria-label="Journey chapter" value={journey.id} onChange={e => setChapterId(e.target.value)}>{chapters.map(c => <option key={c.id} value={c.id}>Chapter {c.chapter}</option>)}</select>}
        <div className="journey-view-toggle"><button aria-label="Graph view" aria-pressed={!list} onClick={() => setList(false)}><Network size={17} /></button><button aria-label="List view" aria-pressed={list} onClick={() => setList(true)}><List size={17} /></button></div>
      </div>
      <div className="journey-workspace">
        {nodes.length === 0 ? <div className="journey-empty"><Search size={28} /><strong>{filter === 'knowledge' ? 'Your first entry is one discovery away.' : filter === 'review' ? 'Let these ideas settle.' : 'No matching discoveries yet.'}</strong><p>{filter === 'review' ? 'Reviews return after 1, 3, 7, 14, then 30 days as your recall strengthens.' : 'Choose All discoveries to keep exploring.'}</p><button onClick={() => { setFilter('all'); setSearch(''); }}>Show all discoveries</button></div>
          : list ? <div className="journey-list" aria-label="Revealed concepts">{nodes.map(n => <button key={n.id} onClick={() => select(n.id)} aria-pressed={n.id === selected}>
            <span className="journey-node-orb">{n.kind === 'boss' ? <Sparkles /> : <Layers />}</span><span><strong>{n.title}</strong><small>{statusLabel(n)} · {n.facets.filter(f => confirmed(n.progress[f])).length}/{n.facets.length} dimensions confirmed</small></span><ArrowRight size={16} />
          </button>)}</div>
            : <JourneyGraph journey={journey} visibleIds={nodes.map(n => n.id)} selected={selected} onSelect={select} />}
        <aside className="journey-detail" aria-label="Concept details">
          {node && currentFacet ? <>
            <span className="journey-eyebrow">{node.kind === 'boss' ? 'THE CONNECTION YOU REVEALED' : 'YOUR NEXT EXPLORATION'}</span>
            <h2>{node.title}</h2><span className={`journey-status journey-status-${node.status}`}>{statusLabel(node)}</span>
            <div className="journey-levels" aria-label="Concept progression">
              <span className={proficient(node, node.progress) ? 'earned' : ''}>1 · Explore {node.facets.filter(f => confirmed(node.progress[f])).length}/{node.facets.length} dimensions</span>
              <span className={proficient(node, node.progress) ? 'earned' : ''}>2 · Proficient — connections unlock</span>
              {node.kind === 'concept' && <span className={node.status === 'mastered' ? 'earned' : ''}>3 · Master — {Math.min(node.progress.advanced?.successes ?? 0, 3)}/3 advanced answers</span>}
            </div>
            {node.rusty && <p className="journey-rust-note">Time to refresh an idea. Your earned level and connections stay with you.</p>}
            <div className="journey-dimensions" aria-label="Dimensions of understanding">{node.facets.map(f => <button key={f} aria-pressed={f === currentFacet} onClick={() => setFacet(f)}>
              <span className={confirmed(node.progress[f]) ? 'dimension-confirmed' : node.progress[f]?.successes ? 'dimension-provisional' : ''}>{confirmed(node.progress[f]) ? <Check size={12} /> : '·'}</span>{FACETS[f].label}
            </button>)}{node.kind === 'concept' && <button className="journey-advanced-tab" disabled={!proficient(node, node.progress)} aria-pressed={currentFacet === 'advanced'} onClick={() => setFacet('advanced')}>
              {proficient(node, node.progress) ? <Sparkles size={14} /> : <LockKeyhole size={14} />} Advanced · {Math.min(node.progress.advanced?.successes ?? 0, 3)}/3
            </button>}</div>
            <div className="journey-facet-detail"><h3>{FACETS[currentFacet].label}</h3><p>{FACETS[currentFacet].description}</p>
              {node.progress[currentFacet]?.entry ? <div className="journey-knowledge-entry"><span><BookOpen size={13} />{reviewDue(node.progress[currentFacet]) ? 'Saved insight · ready to refresh' : node.progress[currentFacet]?.retainedAt ? 'Refreshed through recall' : confirmed(node.progress[currentFacet]) ? 'Confirmed in a fresh example' : 'First insight · provisional'}</span><MathMarkdown content={node.progress[currentFacet]!.entry!} /></div>
                : <p className="journey-unwritten">Your explanation will take shape here after a correct answer.</p>}
              {node.progress[currentFacet]?.lastCorrect === false && <p className="journey-practice-note">That last attempt uncovered something to explore. Try a fresh example.</p>}
              <button className="journey-primary" disabled={disabled} onClick={() => onStart(topic, { journeyId: journey.id, nodeId: node.id, facet: currentFacet })}>
                {reviewDue(node.progress[currentFacet]) ? 'Refresh with a new question' : currentFacet === 'advanced' ? node.status === 'mastered' ? 'Practice an advanced challenge' : 'Take an advanced challenge' : node.progress[currentFacet]?.successes === 1 ? 'Check a fresh example' : confirmed(node.progress[currentFacet]) ? 'Explore another angle' : node.progress[currentFacet]?.attempts ? 'Try a fresh example' : 'Make your first guess'}<ArrowRight size={16} />
              </button>
            </div>
            <p className="journey-evidence-note">A correct answer adds an insight. A second fresh success confirms the dimension. Complete every dimension for proficiency; solve three advanced questions for mastery.</p>
            {node.requires.length > 0 && <div className="journey-connections"><strong>Built on your understanding of</strong>{node.requires.map(r => <button key={r.nodeId} onClick={() => select(r.nodeId)}>{journey.nodes.find(n => n.id === r.nodeId)?.title}<ArrowRight size={12} /></button>)}</div>}
            {journey.frontiers.some(f => f.from.includes(node.id)) && <div className="journey-next-discovery"><Sparkles size={16} /><p>Contribute to your next discovery by confirming {Array.from(new Set(journey.frontiers.flatMap(f => f.contributions.filter(r => r.nodeId === node.id).flatMap(r => r.facets)))).map(f => FACETS[f].label.toLowerCase()).join(' and ')}. Some discoveries need several concepts.</p></div>}
          </> : <p>Select a concept to explore it.</p>}
        </aside>
      </div>
      <footer className="journey-footer"><span><span className="legend-dot" /> Discovered <span className="legend-dot confirmed" /> Confirmed <LockKeyhole size={13} /> Undiscovered</span>
        {recommended && <button onClick={() => { select(recommended.id); setFilter('all'); setSearch(''); }}> <Compass size={15} /> Focus my next step</button>}
      </footer>
      {journey.complete && <div className="journey-complete"><Sparkles /><div><strong>Chapter {journey.chapter} conquered</strong><p>{isDemo ? 'You explored the scripted preview. Sign in with Gemini for new chapters and fresh questions in every dimension.' : 'Your knowledge stays with you. The next chapter starts with a new hidden question.'}</p></div>{!isDemo && <button className="journey-primary" onClick={() => void openNext()} disabled={disabled || loading}>Discover next chapter<ArrowRight size={16} /></button>}</div>}
    </>}
  </section>;
}

function JourneyGraph({ journey, visibleIds, selected, onSelect }: { journey: JourneyView; visibleIds: string[]; selected: string; onSelect: (id: string) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 20, y: 20, scale: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; distance: number; camera: typeof camera } | null>(null);
  const all = [...journey.nodes.map(n => ({ id: n.id, parents: n.requires.map(r => r.nodeId) })), ...journey.frontiers.map(f => ({ id: f.id, parents: f.from }))];
  const depths = new Map<string, number>();
  const depth = (id: string): number => {
    if (depths.has(id)) return depths.get(id)!;
    const parents = all.find(n => n.id === id)?.parents ?? [];
    const d = parents.length ? Math.max(...parents.map(depth)) + 1 : 0;
    depths.set(id, d); return d;
  };
  all.forEach(n => depth(n.id));
  const columns = new Map<number, string[]>();
  for (const n of all) { const d = depths.get(n.id)!; columns.set(d, [...columns.get(d) ?? [], n.id]); }
  const rowCount = Math.max(...[...columns.values()].map(c => c.length), 1);
  const positions = new Map(all.map(n => { const col = columns.get(depths.get(n.id)!)!; return [n.id, { x: 40 + depths.get(n.id)! * 270, y: 55 + (rowCount - col.length) * 85 + col.indexOf(n.id) * 170 }]; }));
  const width = Math.max(...[...positions.values()].map(p => p.x), 0) + 250;
  const height = rowCount * 170 + 60;
  const fit = useCallback(() => {
    if (!viewport.current) return;
    const { clientWidth: w, clientHeight: h } = viewport.current;
    const scale = Math.min((w - 32) / width, (h - 72) / height, 1.15);
    setCamera({ x: (w - width * scale) / 2, y: (h - height * scale) / 2 - 12, scale });
  }, [width, height]);
  useEffect(() => {
    fit();
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (viewport.current) resize?.observe(viewport.current);
    return () => resize?.disconnect();
  }, [fit, journey.id]);
  const zoom = useCallback((factor: number, x?: number, y?: number) => {
    setCamera(c => {
      const scale = Math.min(2, Math.max(0.25, c.scale * factor));
      const cx = x ?? (viewport.current?.clientWidth ?? 600) / 2, cy = y ?? 230;
      return { scale, x: cx - (cx - c.x) * scale / c.scale, y: cy - (cy - c.y) * scale / c.scale };
    });
  }, []);
  useEffect(() => {
    const el = viewport.current;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const rect = el!.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top); };
    el?.addEventListener('wheel', wheel, { passive: false });
    return () => el?.removeEventListener('wheel', wheel);
  }, [zoom]);
  const rebase = () => {
    const points = [...pointers.current.values()];
    if (!points.length) { gesture.current = null; return; }
    gesture.current = { x: points.reduce((a, p) => a + p.x, 0) / points.length, y: points.reduce((a, p) => a + p.y, 0) / points.length,
      distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0, camera };
  };
  return <div ref={viewport} className="journey-graph" role="region" aria-label="Draggable concept map. Use arrow keys to pan, plus and minus to zoom, and zero to fit." tabIndex={0}
    onKeyDown={e => {
      if (e.target !== e.currentTarget) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setCamera(c => ({ ...c, x: c.x + (e.key === 'ArrowLeft' ? 45 : e.key === 'ArrowRight' ? -45 : 0), y: c.y + (e.key === 'ArrowUp' ? 45 : e.key === 'ArrowDown' ? -45 : 0) })); }
      if (e.key === '+' || e.key === '=') zoom(1.2); if (e.key === '-') zoom(1 / 1.2); if (e.key === '0') fit();
    }}
    onPointerDown={e => { if ((e.target as HTMLElement).closest('button')) return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); rebase(); }}
    onPointerMove={e => {
      if (!pointers.current.has(e.pointerId) || !gesture.current) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const points = [...pointers.current.values()], g = gesture.current;
      const x = points.reduce((a, p) => a + p.x, 0) / points.length, y = points.reduce((a, p) => a + p.y, 0) / points.length;
      const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
      const scale = Math.min(2, Math.max(0.25, g.camera.scale * (g.distance && distance ? distance / g.distance : 1)));
      const rect = e.currentTarget.getBoundingClientRect();
      setCamera({ scale, x: x - rect.left - (g.x - rect.left - g.camera.x) * scale / g.camera.scale, y: y - rect.top - (g.y - rect.top - g.camera.y) * scale / g.camera.scale });
    }}
    onPointerUp={e => { pointers.current.delete(e.pointerId); rebase(); }} onPointerCancel={e => { pointers.current.delete(e.pointerId); rebase(); }}>
    <div className="journey-map-label">CHAPTER {journey.chapter}<span>Your constellation of ideas</span></div>
    <div className="journey-canvas" style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
      <svg width={width} height={height} aria-hidden="true" className="journey-edges">{all.flatMap(n => n.parents.map(parent => {
        const from = positions.get(parent)!, to = positions.get(n.id)!;
        const hidden = !journey.nodes.some(v => v.id === n.id);
        return <path key={`${parent}-${n.id}`} d={`M ${from.x + 205} ${from.y + 60} C ${from.x + 244} ${from.y + 60}, ${to.x - 39} ${to.y + 60}, ${to.x} ${to.y + 60}`} className={hidden ? 'edge-hidden' : 'edge-revealed'} />;
      }))}</svg>
      {journey.nodes.map(n => { const pos = positions.get(n.id)!; const count = n.facets.filter(f => confirmed(n.progress[f])).length; return <button key={n.id} type="button" onClick={() => onSelect(n.id)} aria-pressed={n.id === selected} aria-label={`${n.title}, ${statusLabel(n)}, ${count} of ${n.facets.length} dimensions confirmed`}
        className={`journey-node ${n.kind === 'boss' ? 'journey-boss' : ''} ${!visibleIds.includes(n.id) ? 'journey-node-muted' : ''}`} disabled={!visibleIds.includes(n.id)} style={{ left: pos.x, top: pos.y }}>
        <span className="journey-node-top"><span className="journey-node-orb">{n.kind === 'boss' ? <Sparkles size={17} /> : count >= 2 ? <Check size={17} /> : <Layers size={17} />}</span><small>{statusLabel(n)}</small></span>
        <strong>{n.title}</strong><span className="journey-node-progress">{n.facets.map(f => <i key={f} className={confirmed(n.progress[f]) ? 'confirmed' : n.progress[f]?.successes ? 'provisional' : ''} />)}</span>
      </button>; })}
      {journey.frontiers.map(f => { const pos = positions.get(f.id)!; return <div key={f.id} className="journey-frontier" style={{ left: pos.x, top: pos.y }}><LockKeyhole size={20} /><strong>Undiscovered connection</strong><span>{f.ready} / {f.total} foundations ready</span></div>; })}
    </div>
    <div className="journey-map-controls"><span>Drag to explore · scroll or pinch to zoom</span><button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}><Minus size={16} /></button><output aria-label="Zoom level">{Math.round(camera.scale * 100)}%</output><button aria-label="Zoom in" onClick={() => zoom(1.2)}><Plus size={16} /></button><button aria-label="Fit map" onClick={fit}><Focus size={17} /></button></div>
  </div>;
}
