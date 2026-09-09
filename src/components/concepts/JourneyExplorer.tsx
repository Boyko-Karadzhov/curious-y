import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Compass, Focus, Layers, List, Loader2, LockKeyhole, Minus, Network, Plus, Search, Sparkles } from 'lucide-react';
import { TOPICS } from '../../types';
import { confirmed, proficient, type JourneyTarget, type JourneyView, type VisibleNode } from '../../../supabase/functions/_shared/journey';
import { getKnowledgeGraph } from '../../services/backend';
import { demoKnowledgeGraph } from '../../lib/kingdom/demoLearning';
import { MathMarkdown } from '../common/MathMarkdown';
import { TopicSelectionPrompt } from '../home/TopicSelectionPrompt';
import './journey.css';

interface Props {
  userId: string; isDemo: boolean; topic: string; revision: number;
  onTopic: (topic: string) => void;
  onStart: (topic?: string, target?: JourneyTarget) => void;
  disabled?: boolean;
  knowledgeOnly?: boolean;
}
const statusLabel = (n: VisibleNode) => n.rusty ? `${n.status} · ready to refresh` : n.kind === 'boss' ? n.status === 'completed' ? 'Conquered' : 'Challenge revealed' : n.status === 'discovered' ? 'Ready to explore' : n.status;

export function JourneyExplorer({ userId, isDemo, topic, revision, onTopic, onStart, disabled, knowledgeOnly }: Props) {
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [list, setList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    void (async () => {
      try {
        const result = isDemo ? demoKnowledgeGraph(userId) : await getKnowledgeGraph();
        if (cancelled) return;
        setJourney(result);
        setSelected(previous => result.nodes.some(n => n.id === previous) ? previous : result.nodes[0]?.id ?? '');
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your knowledge.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId, isDemo, revision, reload]);
  useEffect(() => {
    const refresh = () => setReload(x => x + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const node = journey?.nodes.find(n => n.id === selected);
  const nodes = journey?.nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <section className="journey" aria-label={knowledgeOnly ? 'Your knowledge graph' : 'Learn'}>
    <header className="journey-heading"><div><span className="journey-eyebrow"><Compass size={14} /> FOLLOW YOUR CURIOSITY</span>
      <h1>{knowledgeOnly ? 'Your knowledge graph' : 'What will you discover?'}</h1>
      <p>{knowledgeOnly ? 'Every topic, every chapter, and the connections between them.' : 'Choose a topic or let curiosity choose. Each question takes your understanding a step further.'}</p>
    </div></header>
    {error && <div role="alert" className="journey-error">{error}<button onClick={() => setReload(x => x + 1)}>Retry</button></div>}
    {loading ? <div className="journey-loading" role="status"><Loader2 className="animate-spin" /> Loading your knowledge…</div> : !knowledgeOnly ? <>
      <TopicSelectionPrompt onSelectTopic={onStart} isLoading={disabled || !!error} mastery={journey?.topicMastery} />
      <p className="journey-evidence-note">Percentages measure progress toward mastery of your generated concepts. New discoveries expand what there is to learn.</p>
      {isDemo && <p className="journey-evidence-note">Explorer Demo has a fixed set of sample discoveries. Sign in to generate new concepts across each topic.</p>}
    </> : journey && <>
      <div className="journey-toolbar">
        <label className="journey-search"><Search size={15} /><input aria-label="Search revealed concepts" placeholder="Find a concept across all topics" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label className="journey-topic">Get a question<select aria-label="Practice topic" value={topic} onChange={e => onTopic(e.target.value)} disabled={disabled}>
          {TOPICS.map(t => <option key={t} value={t}>{t} · {journey.topicMastery?.[t] ?? 0}%</option>)}
        </select></label>
        <button className="journey-primary" disabled={disabled} onClick={() => onStart(topic)}>Practice topic<ArrowRight size={16} /></button>
        <div className="journey-view-toggle"><button aria-label="Graph view" aria-pressed={!list} onClick={() => setList(false)}><Network size={17} /></button><button aria-label="List view" aria-pressed={list} onClick={() => setList(true)}><List size={17} /></button></div>
      </div>
      <div className="journey-workspace">
        {nodes.length === 0 ? <div className="journey-empty"><Search size={28} /><strong>{search ? 'No matching concepts.' : 'Your graph starts with your first discovery.'}</strong><p>Choose a topic to begin exploring.</p></div>
          : list ? <div className="journey-list" aria-label="Revealed concepts">{nodes.map(n => <button key={n.id} onClick={() => setSelected(n.id)} aria-pressed={n.id === selected}>
            <span className="journey-node-orb"><Layers /></span><span><strong>{n.title}</strong><small>{n.topic} · {statusLabel(n)}</small></span><ArrowRight size={16} />
          </button>)}</div> : <JourneyGraph journey={journey} visibleIds={nodes.map(n => n.id)} selected={selected} onSelect={setSelected} />}
        <aside className="journey-detail" aria-label="Concept details">
          {node ? <>
            <span className="journey-eyebrow">{node.topic}</span><h2>{node.title}</h2>
            <span className={`journey-status journey-status-${node.status}`}>{statusLabel(node)}</span>
            <p className="journey-evidence-note">{proficient(node, node.progress) ? node.status === 'mastered' ? 'Mastered. Keep your understanding fresh with practice.' : 'Proficient. Advanced questions deepen your mastery.' : 'Each question builds on the last. Your next step is chosen automatically.'}</p>
            <button className="journey-primary" disabled={disabled} onClick={() => onStart(node.topic, node.target)}>Practice this concept<ArrowRight size={16} /></button>
            {Object.values(node.progress).some(p => p?.entry) && <div className="journey-knowledge-entry"><span><BookOpen size={13} />Your saved insights</span>
              {Object.entries(node.progress).filter(([,p]) => p?.entry).map(([f,p]) => <MathMarkdown key={f} content={p!.entry!} />)}
            </div>}
            {node.requires.length > 0 && <div className="journey-connections"><strong>Built on your understanding of</strong>{node.requires.map(r => <button key={r.nodeId} onClick={() => setSelected(r.nodeId)}>{journey.nodes.find(n => n.id === r.nodeId)?.title}<ArrowRight size={12} /></button>)}</div>}
          </> : <p>Select a concept to explore it.</p>}
        </aside>
      </div>
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
    depths.set(id, 0);
    const parents = (all.find(n => n.id === id)?.parents ?? []).filter(p => all.some(n => n.id === p));
    const d = parents.length ? Math.max(...parents.map(depth)) + 1 : 0;
    depths.set(id, d); return d;
  };
  all.forEach(n => depth(n.id));
  // Connected branches share a layout, even when their concepts span topics.
  const neighbors = new Map(all.map(n => [n.id, new Set(n.parents)]));
  for (const n of all) for (const parent of n.parents) neighbors.get(parent)?.add(n.id);
  const remaining = new Set(all.map(n => n.id));
  const components: string[][] = [];
  while (remaining.size) {
    const stack = [remaining.values().next().value!], component: string[] = [];
    while (stack.length) {
      const id = stack.pop()!;
      if (!remaining.delete(id)) continue;
      component.push(id); stack.push(...neighbors.get(id) ?? []);
    }
    components.push(component);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const layouts = components.map(ids => {
    const columns = new Map<number, string[]>();
    for (const id of ids) { const d = depths.get(id)!; columns.set(d, [...columns.get(d) ?? [], id]); }
    const rows = Math.max(...[...columns.values()].map(c => c.length), 1);
    return { ids, columns, rows, width: (Math.max(...columns.keys()) + 1) * 270, height: rows * 170 + 50 };
  });
  const perRow = Math.ceil(Math.sqrt(components.length));
  let offsetX = 40, offsetY = 55, rowHeight = 0, width = 0;
  layouts.forEach((layout, i) => {
    if (i > 0 && i % perRow === 0) { offsetX = 40; offsetY += rowHeight + 40; rowHeight = 0; }
    for (const id of layout.ids) {
      const d = depths.get(id)!, column = layout.columns.get(d)!;
      positions.set(id, { x: offsetX + d * 270, y: offsetY + (layout.rows - column.length) * 85 + column.indexOf(id) * 170 });
    }
    offsetX += layout.width + 50; width = Math.max(width, offsetX);
    rowHeight = Math.max(rowHeight, layout.height);
  });
  const height = offsetY + rowHeight;
  const fit = useCallback(() => {
    if (!viewport.current) return;
    const { clientWidth: w, clientHeight: h } = viewport.current;
    const scale = Math.min((w - 32) / width, (h - 72) / height, 1.15);
    setCamera({ x: (w - width * scale) / 2, y: (h - height * scale) / 2 - 12, scale });
  }, [width, height]);
  const selectedX = positions.get(selected)?.x ?? 40, selectedY = positions.get(selected)?.y ?? 55;
  useEffect(() => {
    // Open at a readable scale. Fit map offers the full overview.
    setCamera({ x: 30 - selectedX * 0.8, y: 75 - selectedY * 0.8, scale: 0.8 });
  }, [selectedX, selectedY, journey.id]);
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
    <div className="journey-map-label">ALL TOPICS<span>Your connected knowledge</span></div>
    <div className="journey-canvas" style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
      <svg width={width} height={height} aria-hidden="true" className="journey-edges">{all.flatMap(n => n.parents.map(parent => {
        const from = positions.get(parent)!, to = positions.get(n.id)!;
        if (!from || !to) return null;
        const hidden = !journey.nodes.some(v => v.id === n.id);
        return <path key={`${parent}-${n.id}`} d={`M ${from.x + 205} ${from.y + 60} C ${from.x + 244} ${from.y + 60}, ${to.x - 39} ${to.y + 60}, ${to.x} ${to.y + 60}`} className={hidden ? 'edge-hidden' : 'edge-revealed'} />;
      }))}</svg>
      {journey.nodes.map(n => { const pos = positions.get(n.id)!; const count = n.facets.filter(f => confirmed(n.progress[f])).length; return <button key={n.id} type="button" onClick={() => onSelect(n.id)} aria-pressed={n.id === selected} aria-label={`${n.title}, ${statusLabel(n)}, ${count} of ${n.facets.length} dimensions confirmed`}
        className={`journey-node ${n.kind === 'boss' ? 'journey-boss' : ''} ${!visibleIds.includes(n.id) ? 'journey-node-muted' : ''}`} disabled={!visibleIds.includes(n.id)} style={{ left: pos.x, top: pos.y }}>
        <span className="journey-node-top"><span className="journey-node-orb">{n.kind === 'boss' ? <Sparkles size={17} /> : count >= 2 ? <Check size={17} /> : <Layers size={17} />}</span><small>{statusLabel(n)}</small></span>
        <strong>{n.title}</strong><small>{n.topic}</small><span className="journey-node-progress">{n.facets.map(f => <i key={f} className={confirmed(n.progress[f]) ? 'confirmed' : n.progress[f]?.successes ? 'provisional' : ''} />)}</span>
      </button>; })}
      {journey.frontiers.map(f => { const pos = positions.get(f.id)!; return <div key={f.id} className="journey-frontier" style={{ left: pos.x, top: pos.y }}><LockKeyhole size={20} /><strong>Undiscovered connection</strong><span>{f.ready} / {f.total} foundations ready</span></div>; })}
    </div>
    <div className="journey-map-controls"><span>Drag to explore · scroll or pinch to zoom</span><button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}><Minus size={16} /></button><output aria-label="Zoom level">{Math.round(camera.scale * 100)}%</output><button aria-label="Zoom in" onClick={() => zoom(1.2)}><Plus size={16} /></button><button aria-label="Fit map" onClick={fit}><Focus size={17} /></button></div>
  </div>;
}
