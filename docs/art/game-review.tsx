import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CastleMap, CastleSelection } from '../../src/components/kingdom/CastleMap';
import { KnowledgeTowers } from '../../src/components/kingdom/KnowledgeTowers';
import { newKingdom } from '../../src/lib/kingdom/game';
import '../../src/index.css';

export function ArtReview() {
  const [level, setLevel] = useState(5);
  const [built, setBuilt] = useState(true);
  const [selected, setSelected] = useState<CastleSelection>('castle');
  const base = newKingdom();
  const state = { ...base, castle: level,
    buildings: Object.fromEntries(Object.keys(base.buildings).map(id => [id, built ? 1 : 0])) as typeof base.buildings,
    towers: { ...base.towers, points: Object.fromEntries(Object.keys(base.towers.points).map(key => [key, 0])) as typeof base.towers.points },
  };
  return <main style={{ maxWidth: 1000, margin: 'auto', padding: 16, color: '#edf3ee' }}>
    <h1 style={{ fontSize: 28, fontWeight: 700 }}>Castle art review</h1>
    <p style={{ margin: '12px 0' }}>Actual game components with a local sample kingdom. <a href="./review.html">View the asset collection</a></p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, margin: '16px 0' }}>
      <label>Keep level <select value={level} onChange={event => setLevel(Number(event.target.value))}>{[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}</select></label>
      <label><input type="checkbox" checked={built} onChange={event => setBuilt(event.target.checked)} /> Buildings constructed</label>
    </div>
    <CastleMap state={state} selected={selected} onSelect={setSelected} onInspect={() => undefined} />
    <div style={{ marginTop: 24 }}><KnowledgeTowers state={state} /></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<ArtReview />);
