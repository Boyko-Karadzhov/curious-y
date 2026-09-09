import React, { useState, useEffect } from 'react';
import {
    X,
    Network,
    Award,
    Search,
    CheckCircle2,
    Lock,
    Layers,
    Sparkles,
    BookOpen,
    HelpCircle,
    RotateCcw,
    Loader2,
} from 'lucide-react';
import { Concept, MasteryLevel, REASONING_COMPLEXITIES, REASONING_COMPLEXITY_INFO, TOPICS } from '../../types';
import { getUserConcepts, resetUserProgress, shouldConfirmReset } from '../../services/database';
import { useAuth } from '../../context/AuthContext';

interface ConceptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetProgress?: () => Promise<void> | void;
}

const MASTERY_BADGES: Record<
  MasteryLevel,
  { label: string; bg: string; text: string; border: string }
> = {
    mastered: {
        label: 'Mastered',
        bg: 'bg-emerald-100',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
    },
    proficient: {
        label: 'Proficient',
        bg: 'bg-indigo-100',
        text: 'text-indigo-800',
        border: 'border-indigo-300',
    },
    learning: {
        label: 'Learning',
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        border: 'border-amber-300',
    },
    unseen: {
        label: 'Unseen',
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-300',
    },
};

export const ConceptsModal: React.FC<ConceptsModalProps> = ({
    isOpen,
    onClose,
    onResetProgress,
}) => {
    const { user } = useAuth();
    const [concepts, setConcepts] = useState<Concept[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedTopic, setSelectedTopic] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [resetting, setResetting] = useState<boolean>(false);
    const [resetSuccess, setResetSuccess] = useState<boolean>(false);

    const handleResetProgress = async () => {
        if (!user) {
            return;
        }
        if (!shouldConfirmReset()) {
            return;
        }
        setResetting(true);
        try {
            if (onResetProgress) {
                await onResetProgress();
            } else {
                await resetUserProgress(user.id);
            }
            setConcepts([]);
            setResetSuccess(true);
            setTimeout(() => setResetSuccess(false), 2000);
        } catch (err) {
            console.error('Error resetting concepts progress:', err);
        } finally {
            setResetting(false);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        const previousRootOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
            document.documentElement.style.overflow = previousRootOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && user) {
            setLoading(true);
            getUserConcepts(user.id)
                .then((list) => {
                    setConcepts(list);
                    setLoading(false);
                })
                .catch((err) => {
                    console.warn('Failed to load concepts for modal:', err);
                    setLoading(false);
                });
        }
    }, [isOpen, user]);

    if (!isOpen) {
        return null;
    }

    // Compute stats
    const totalConcepts = concepts.length;
    const masteredCount = concepts.filter((c) => c.mastery === 'mastered').length;
    const proficientCount = concepts.filter((c) => c.mastery === 'proficient').length;
    const learningCount = concepts.filter((c) => c.mastery === 'learning').length;
    const unseenCount = concepts.filter((c) => c.mastery === 'unseen').length;

    // Filter concepts
    const filteredConcepts = concepts.filter((c) => {
    // Topic filter
        if (selectedTopic !== 'All') {
            const normSelected = selectedTopic.toLowerCase();
            const matchesTopic = Object.keys(c.topics || {}).some(
                (t) => t.toLowerCase() === normSelected && (c.topics[t] ?? 0) > 0
            );
            if (!matchesTopic) {
                return false;
            }
        }

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.trim().toLowerCase();
            const inName = c.canonicalName.toLowerCase().includes(query);
            const inDef = c.definition.toLowerCase().includes(query);
            const inAliases = (c.aliases || []).some((a) => a.toLowerCase().includes(query));
            if (!inName && !inDef && !inAliases) {
                return false;
            }
        }

        return true;
    });

    return (
        <div className="fixed left-0 top-0 w-screen h-[100dvh] z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-fade-in sm:p-4">
            <div
                className="concepts-dialog bg-white w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden sm:rounded-3xl sm:border sm:border-slate-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="concepts-modal-title"
            >
                {/* Header */}
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80 shrink-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand-100 border border-brand-200 flex items-center justify-center text-brand-700 shadow-2xs">
                            <Network className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 id="concepts-modal-title" className="font-extrabold text-base sm:text-lg text-slate-900">
                                <span className="sm:hidden">Knowledge Graph</span>
                                <span className="hidden sm:inline">Knowledge Graph &amp; Concepts DAG</span>
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                Concepts, prerequisites &amp; mastery
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                        aria-label="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {/* Stats Summary Bar */}
                    <div className="px-4 py-4 sm:px-6 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-brand-50/30 border-b border-slate-200/70">
                        <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-xl font-black text-slate-800">{totalConcepts}</span>
                            <span className="text-sm text-slate-500 font-medium">Total Concepts</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 text-center">
                            <div className="px-1 py-2 sm:px-2 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                                <div className="text-xs text-emerald-700 font-medium">Mastered</div>
                                <div className="text-lg font-black text-emerald-700">{masteredCount}</div>
                            </div>
                            <div className="px-1 py-2 sm:px-2 bg-white rounded-xl border border-indigo-200 shadow-2xs">
                                <div className="text-xs text-indigo-700 font-medium">Proficient</div>
                                <div className="text-lg font-black text-indigo-700">{proficientCount}</div>
                            </div>
                            <div className="px-1 py-2 sm:px-2 bg-white rounded-xl border border-amber-200 shadow-2xs">
                                <div className="text-xs text-amber-700 font-medium">Learning</div>
                                <div className="text-lg font-black text-amber-700">{learningCount}</div>
                            </div>
                            <div className="px-1 py-2 sm:px-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                <div className="text-xs text-slate-500 font-medium">Unseen</div>
                                <div className="text-lg font-black text-slate-600">{unseenCount}</div>
                            </div>
                        </div>
                    </div>

                    {/* Controls: Search and Topic Filter */}
                    <div className="px-4 py-4 sm:px-6 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                        {/* Search Box */}
                        <div className="relative min-w-0">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search concepts or aliases..."
                                aria-label="Search concepts"
                                className="w-full min-h-11 pl-9 pr-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                            />
                        </div>

                        <select
                            aria-label="Filter by topic"
                            value={selectedTopic}
                            onChange={(e) => setSelectedTopic(e.target.value)}
                            className="w-full min-w-0 min-h-11 px-3 py-2 text-base sm:text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                        >
                            <option value="All">All topics</option>
                            {TOPICS.map((topic) => (
                                <option key={topic} value={topic}>{topic}</option>
                            ))}
                        </select>
                    </div>

                    {/* Concept Cards List */}
                    <div className="p-4 sm:p-6 space-y-4">
                        {loading ? (
                            <div className="py-12 text-center text-slate-400 text-sm">
                                <Sparkles className="w-6 h-6 animate-spin mx-auto text-brand-500 mb-2" />
                Loading knowledge graph...
                            </div>
                        ) : filteredConcepts.length === 0 ? (
                            <div className="py-12 text-center space-y-3">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                    <BookOpen className="w-7 h-7" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-bold text-slate-700 text-sm">
                                        {totalConcepts === 0
                                            ? 'No concepts built yet'
                                            : 'No concepts match your filter'}
                                    </h4>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                        {totalConcepts === 0
                                            ? 'Answer your first Boss Question to automatically extract and build your personalized prerequisite DAG!'
                                            : 'Try clearing your search query or selecting another topic filter.'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredConcepts.map((concept) => {
                                    const badge = MASTERY_BADGES[concept.mastery] || MASTERY_BADGES.unseen;

                                    return (
                                        <div
                                            key={concept.canonicalName}
                                            className="min-w-0 [overflow-wrap:anywhere] p-4 sm:p-5 rounded-2xl border border-slate-200/80 bg-white hover:border-brand-300 hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
                                        >
                                            <div className="space-y-2">
                                                {/* Top row: Name and Mastery Badge */}
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1 basis-40 space-y-0.5">
                                                        <h3 className="font-bold text-base text-slate-900 leading-snug">
                                                            {concept.canonicalName}
                                                        </h3>
                                                        {concept.aliases && concept.aliases.length > 0 && (
                                                            <p className="text-xs text-slate-500 italic">
                                a.k.a. {concept.aliases.join(', ')}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border} shrink-0`}
                                                    >
                                                        {concept.mastery === 'mastered' ? (
                                                            <Award className="w-3 h-3" />
                                                        ) : (
                                                            <CheckCircle2 className="w-3 h-3" />
                                                        )}
                                                        <span>{badge.label}</span>
                                                    </span>
                                                </div>

                                                {/* Definition */}
                                                <p className="text-sm text-slate-600 leading-relaxed">
                                                    {concept.definition}
                                                </p>

                                                {/* Topics with weights */}
                                                {concept.topics && Object.keys(concept.topics).length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                        {Object.entries(concept.topics)
                                                            .sort((a, b) => b[1] - a[1])
                                                            .map(([t, weight], idx) => {
                                                                const isPrimary = idx === 0;
                                                                const hasMultiple = Object.keys(concept.topics).length > 1;
                                                                return (
                                                                    <span
                                                                        key={t}
                                                                        className={`max-w-full text-xs px-2 py-1 rounded-md border transition-all ${isPrimary && hasMultiple
                                                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-semibold shadow-2xs'
                                                                            : 'bg-slate-100 text-slate-600 border-slate-200 font-medium'
                                                                        }`}
                                                                    >
                                                                        {t} {weight < 1 ? `(${(weight * 100).toFixed(0)}%)` : ''}
                                                                        {isPrimary && hasMultiple ? ' ★' : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                    </div>
                                                )}

                                                {/* Prerequisites */}
                                                {concept.prerequisites && concept.prerequisites.length > 0 ? (
                                                    <div className="pt-2 border-t border-slate-100 space-y-1">
                                                        <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                                            <Layers className="w-3 h-3 text-indigo-500" />
                                                            <span>Prerequisites:</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {concept.prerequisites.map((pName) => {
                                                                const pConcept = concepts.find(
                                                                    (c) => c.canonicalName.toLowerCase() === pName.toLowerCase()
                                                                );
                                                                const isProf =
                                  pConcept &&
                                  (pConcept.mastery === 'proficient' ||
                                    pConcept.mastery === 'mastered');

                                                                return (
                                                                    <span
                                                                        key={pName}
                                                                        className={`max-w-full inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${isProf
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                                                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                                                        }`}
                                                                    >
                                                                        {isProf ? (
                                                                            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600" />
                                                                        ) : (
                                                                            <Lock className="w-3 h-3 shrink-0 text-slate-400" />
                                                                        )}
                                                                        <span className="min-w-0">{pName}</span>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ) : concept.isAtomic ? (
                                                    <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-200/60 px-2.5 py-1 rounded-md">
                                                        <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                                                        <span>Foundational primitive (assumed mastered)</span>
                                                    </div>
                                                ) : (
                                                    <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 italic">
                            Frontier concept (standalone entry point)
                                                    </div>
                                                )}
                                            </div>

                                            {/* Reasoning Complexity Track */}
                                            <details className="border-t border-slate-100 bg-slate-50/60 -mx-4 !-mb-4 sm:-mx-5 sm:!-mb-5 rounded-b-2xl">
                                                <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 rounded-b-2xl hover:bg-slate-100">
                          Reasoning progress
                                                </summary>
                                                <div className="px-4 pb-4 space-y-3">
                                                    {concept.lastAsked && (
                                                        <p className="text-xs text-slate-500">
                              Last practiced: {concept.lastAsked}
                                                        </p>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        {REASONING_COMPLEXITIES.map((comp) => {
                                                            const count = concept.reasoningTrack?.[comp] || 0;
                                                            const info = REASONING_COMPLEXITY_INFO[comp];

                                                            return (
                                                                <div
                                                                    key={comp}
                                                                    className={`min-w-0 p-2.5 rounded-lg border transition-all ${count >= 3
                                                                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold'
                                                                        : count >= 1
                                                                            ? 'bg-brand-50 border-brand-200 text-brand-800 font-semibold'
                                                                            : 'bg-white border-slate-200 text-slate-600'
                                                                    }`}
                                                                    title={`${info.name}: ${info.description} (Score: ${count})`}
                                                                >
                                                                    <div className="font-semibold">
                                                                        {info.name}
                                                                    </div>
                                                                    <div className="mt-1 font-bold">
                                                                        {count} correct
                                                                    </div>
                                                                    <p className="mt-1 font-normal leading-relaxed">{info.description}</p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </details>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 sm:px-6 border-t border-slate-100 bg-slate-50 text-sm text-slate-500 space-y-3">
                        <details>
                            <summary className="min-h-11 py-3 cursor-pointer font-semibold text-slate-600">
                                <HelpCircle className="inline w-4 h-4 mr-1" /> How complexity unlocks
                            </summary>
                            <p className="pb-3 leading-relaxed">
                Complexity unlocks: <strong>Unseen</strong> (Direct inference) &bull; <strong>Learning</strong> (+Composition, Discrimination) &bull; <strong>5 correct core answers, at least 1 in each</strong> (All 7 complexities). Stages with 3 correct answers wait while other unlocked stages catch up.
                            </p>
                        </details>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                            <button
                                type="button"
                                onClick={handleResetProgress}
                                disabled={resetting}
                                className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                title="Reset all concepts, reasoning tracks, and mastery progress"
                                aria-label="Reset Progress"
                            >
                                {resetting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : resetSuccess ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                ) : (
                                    <RotateCcw className="w-4 h-4" />
                                )}
                                <span>{resetSuccess ? 'Reset!' : 'Reset Progress'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="min-h-11 px-6 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                Done
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
