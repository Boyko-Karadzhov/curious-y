import type { VisibleNode } from '../../../supabase/functions/_shared/journey';

export const statusLabel = (node: VisibleNode) => node.rusty ? `${node.status} · ready to refresh`
    : node.kind === 'boss' ? node.status === 'completed' ? 'Conquered' : 'Challenge revealed'
        : node.status === 'discovered' ? 'Ready to explore' : node.status;
