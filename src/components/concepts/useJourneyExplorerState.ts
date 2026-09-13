import { useEffect, useId, useRef, useState } from 'react';
import type { JourneyView } from '../../../supabase/functions/_shared/journey';
import { getKnowledgeGraph } from '../../services/backend';
import { demoKnowledgeGraph } from '../../lib/kingdom/demoLearning';

function useSelection() {
    const [selected, setSelected] = useState('');
    const [search, setSearch] = useState('');
    const [list, setList] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(true);
    const detailId = useId();
    const detailToggle = useRef<HTMLButtonElement>(null);
    const selectConcept = (id: string) => {
        setSelected(id);
        setDetailsOpen(true);
    };

    return { selected, setSelected, search, setSearch, list, setList, detailsOpen, setDetailsOpen,
        detailId, detailToggle, selectConcept };
}

async function loadJourney(userId: string, isDemo: boolean, active: () => boolean,
    setJourney: (journey: JourneyView) => void, setSelected: React.Dispatch<React.SetStateAction<string>>,
    setError: (error: string) => void, setLoading: (loading: boolean) => void): Promise<void> {
    try {
        const result = isDemo ? demoKnowledgeGraph(userId) : await getKnowledgeGraph();
        if (!active()) {
            return;
        }

        setJourney(result);
        setSelected(previous => result.nodes.some(node => node.id === previous) ? previous : result.nodes[0]?.id ?? '');
    } catch (error) {
        if (active()) {
            setError(error instanceof Error ? error.message : 'Could not load your knowledge.');
        }
    } finally {
        if (active()) {
            setLoading(false);
        }
    }
}

function useJourneyData(userId: string, isDemo: boolean, revision: number,
    setSelected: React.Dispatch<React.SetStateAction<string>>) {
    const [journey, setJourney] = useState<JourneyView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        void loadJourney(userId, isDemo, () => active, setJourney, setSelected, setError, setLoading);
        return () => {
            active = false;
        };
    }, [userId, isDemo, revision, reload, setSelected]);
    useEffect(() => {
        const refresh = () => setReload(value => value + 1);
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, []);
    return { journey, loading, error, setReload };
}

export function useJourneyExplorerState(userId: string, isDemo: boolean, revision: number) {
    const selection = useSelection();
    const data = useJourneyData(userId, isDemo, revision, selection.setSelected);
    const node = data.journey?.nodes.find(candidate => candidate.id === selection.selected);
    const nodes = data.journey?.nodes.filter(candidate => candidate.title.toLowerCase().includes(selection.search.toLowerCase())) ?? [];
    return { ...selection, ...data, node, nodes };
}
