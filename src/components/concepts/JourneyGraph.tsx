import { Check, Focus, Layers, LockKeyhole, Minus, Plus, Sparkles } from 'lucide-react';
import { confirmed, conceptMastery, nodeSteps, type JourneyView } from '../../../supabase/functions/_shared/journey';
import { statusLabel } from './journeyLabels';
import { journeyGraphLayout, type GraphNode, type Point } from './journeyGraphLayout';
import { useJourneyGraphCamera, type Camera } from './useJourneyGraphCamera';
import { useJourneyGraphInteractions } from './useJourneyGraphInteractions';

type GraphProps = {
    journey: JourneyView;
    visibleIds: string[];
    selected: string;
    onSelect: (id: string) => void;
    onBackgroundClick: () => void
};
type CanvasProps = Pick<GraphProps, 'journey' | 'visibleIds' | 'selected' | 'onSelect'> & {
    nodes: GraphNode[];
    positions: Map<string, Point>;
    width: number;
    height: number;
    camera: Camera
};

function GraphEdges({ nodes, positions, journey, width, height }: Pick<CanvasProps, 'nodes' | 'positions' | 'journey' | 'width' | 'height'>) {
    return <svg width={width} height={height} aria-hidden="true" className="journey-edges">{nodes.flatMap(node =>
        node.parents.map(parent => {
            const from = positions.get(parent), to = positions.get(node.id);
            if (!from || !to) {
                return null;
            }

            const hidden = !journey.nodes.some(value => value.id === node.id);
            return <path key={`${parent}-${node.id}`}
                d={`M ${from.x + 205} ${from.y + 60} C ${from.x + 244} ${from.y + 60}, ${to.x - 39} ${to.y + 60}, ${to.x} ${to.y + 60}`}
                className={hidden ? 'edge-hidden' : 'edge-revealed'} />;
        }))}</svg>;
}

function GraphConcepts({ journey, positions, visibleIds, selected, onSelect }: Pick<CanvasProps, 'journey' | 'positions' | 'visibleIds' | 'selected' | 'onSelect'>) {
    return <>{journey.nodes.map(node => {
        const pos = positions.get(node.id)!;
        const steps = nodeSteps(node);
        const count = steps.filter(facet => node.kind === 'boss'
            ? (node.progress[facet]?.successes ?? 0) >= 1 : confirmed(node.progress[facet])).length;
        const progressLabel = node.kind === 'boss' ? `${count} of 1 question completed` : `${count} of ${steps.length} dimensions confirmed`;
        return <button key={node.id} type="button" onClick={() => onSelect(node.id)}
            aria-pressed={node.id === selected}
            aria-label={`${node.title}, ${statusLabel(node)}, ${progressLabel}`}
            className={`journey-node ${node.kind === 'boss' ? 'journey-boss' : ''} ${!visibleIds.includes(node.id) ? 'journey-node-muted' : ''}`}
            disabled={!visibleIds.includes(node.id)} style={{
                left: pos.x,
                top: pos.y
            }}>
            <span className="journey-node-top"><span className="journey-node-orb">{node.kind === 'boss' ? <Sparkles size={17} /> : count >= 2 ? <Check size={17} /> : <Layers size={17} />}</span><small>{statusLabel(node)}</small></span>
            <strong>{node.title}</strong><small>{node.topic}</small>
            <span className="journey-node-progress">{steps.map(facet => <i key={facet} className={(node.progress[facet]?.successes ?? 0) >= (node.kind === 'boss' ? 1 : 2) ? 'confirmed' : node.progress[facet]?.successes ? 'provisional' : ''} />)}</span>
            {node.kind === 'concept' && <small>{conceptMastery(node)}% toward mastery</small>}
        </button>;
    })}</>;
}

function GraphFrontiers({ journey, positions }: Pick<CanvasProps, 'journey' | 'positions'>) {
    return <>{journey.frontiers.map(frontier => {
        const pos = positions.get(frontier.id)!;
        return <div key={frontier.id} className="journey-frontier" style={{
            left: pos.x,
            top: pos.y
        }}>
            <LockKeyhole size={20} /><strong>Undiscovered connection</strong>
            <span>{frontier.ready} / {frontier.total} foundations ready</span>
        </div>;
    })}</>;
}

function GraphCanvas(props: CanvasProps) {
    const { camera, width, height } = props;
    return <div className="journey-canvas" style={{
        width,
        height,
        transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`
    }}>
        <GraphEdges {...props} />
        <GraphConcepts {...props} />
        <GraphFrontiers {...props} />
    </div>;
}

function GraphControls({ camera, zoom, fit }: {
    camera: Camera;
    zoom: (factor: number) => void;
    fit: () => void
}) {
    return <div className="journey-map-controls"><span>Drag to explore · scroll or pinch to zoom</span>
        <button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}><Minus size={16} /></button>
        <output aria-label="Zoom level">{Math.round(camera.scale * 100)}%</output>
        <button aria-label="Zoom in" onClick={() => zoom(1.2)}><Plus size={16} /></button>
        <button aria-label="Fit map" onClick={fit}><Focus size={17} /></button>
    </div>;
}

export function JourneyGraph(props: GraphProps) {
    const { nodes, positions, width, height } = journeyGraphLayout(props.journey);
    const selected = positions.get(props.selected) ?? {
        x: 40,
        y: 55
    };
    const { viewport, camera, setCamera, fit, zoom } = useJourneyGraphCamera(width, height, selected, props.journey.id);
    const interactions = useJourneyGraphInteractions(camera, setCamera, zoom, fit, props.onBackgroundClick);
    return <div ref={viewport} className="journey-graph" role="region"
        aria-label="Draggable concept map. Use arrow keys to pan, plus and minus to zoom, and zero to fit."
        tabIndex={0} {...interactions}>
        <div className="journey-map-label">ALL TOPICS<span>Your connected knowledge</span></div>
        <GraphCanvas {...props} nodes={nodes} positions={positions} width={width} height={height} camera={camera} />
        <GraphControls camera={camera} zoom={zoom} fit={fit} />
    </div>;
}
