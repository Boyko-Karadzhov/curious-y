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
} from 'lucide-react';
import { Concept, MasteryLevel, REASONING_COMPLEXITIES, REASONING_COMPLEXITY_INFO, TOPICS } from '../../types';
import { getUserConcepts } from '../../services/database';
import { useAuth } from '../../context/AuthContext';

interface ConceptsModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export const ConceptsModal: React.FC<ConceptsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  if (!isOpen) return null;

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
      if (!matchesTopic) return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const inName = c.canonicalName.toLowerCase().includes(query);
      const inDef = c.definition.toLowerCase().includes(query);
      const inAliases = (c.aliases || []).some((a) => a.toLowerCase().includes(query));
      if (!inName && !inDef && !inAliases) return false;
    }

    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concepts-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-100 border border-brand-200 flex items-center justify-center text-brand-700 shadow-2xs">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 id="concepts-modal-title" className="font-extrabold text-base sm:text-lg text-slate-900">
                Knowledge Graph &amp; Concepts DAG
              </h2>
              <p className="text-xs text-slate-500">
                Track your prerequisite dependencies, reasoning complexity, and mastery levels
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Summary Bar */}
        <div className="px-6 py-3 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-brand-50/30 border-b border-slate-200/70 grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0 text-center">
          <div className="p-2 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium">Total Concepts</div>
            <div className="text-lg font-black text-slate-800">{totalConcepts}</div>
          </div>
          <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-2xs">
            <div className="text-xs text-emerald-700 font-medium">Mastered</div>
            <div className="text-lg font-black text-emerald-700">{masteredCount}</div>
          </div>
          <div className="p-2 bg-white rounded-xl border border-indigo-200 shadow-2xs">
            <div className="text-xs text-indigo-700 font-medium">Proficient</div>
            <div className="text-lg font-black text-indigo-700">{proficientCount}</div>
          </div>
          <div className="p-2 bg-white rounded-xl border border-amber-200 shadow-2xs">
            <div className="text-xs text-amber-700 font-medium">Learning</div>
            <div className="text-lg font-black text-amber-700">{learningCount}</div>
          </div>
          <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-500 font-medium">Unseen</div>
            <div className="text-lg font-black text-slate-600">{unseenCount}</div>
          </div>
        </div>

        {/* Controls: Search and Topic Filter */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 bg-white">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search concepts or aliases..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
            />
          </div>

          {/* Topic Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto py-0.5">
            <button
              type="button"
              onClick={() => setSelectedTopic('All')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedTopic === 'All'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            {TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => setSelectedTopic(topic)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedTopic === topic
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* Concept Cards List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                    className="p-5 rounded-2xl border border-slate-200/80 bg-white hover:border-brand-300 hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      {/* Top row: Name and Mastery Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <h3 className="font-bold text-sm text-slate-900 leading-snug">
                            {concept.canonicalName}
                          </h3>
                          {concept.aliases && concept.aliases.length > 0 && (
                            <p className="text-[11px] text-slate-400 italic">
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
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {concept.definition}
                      </p>

                      {/* Topics with weights */}
                      {concept.topics && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {Object.entries(concept.topics).map(([t, weight]) => (
                            <span
                              key={t}
                              className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200"
                            >
                              {t} {weight < 1 ? `(${(weight * 100).toFixed(0)}%)` : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Prerequisites */}
                      {concept.prerequisites && concept.prerequisites.length > 0 ? (
                        <div className="pt-2 border-t border-slate-100 space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
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
                                  className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border ${
                                    isProf
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                                      : 'bg-slate-50 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  {isProf ? (
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  ) : (
                                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                                  )}
                                  <span>{pName}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : concept.isAtomic ? (
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50/70 border border-amber-200/60 px-2.5 py-1 rounded-md">
                          <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>Foundational primitive (everyday intuition)</span>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 italic">
                          Frontier concept (standalone entry point)
                        </div>
                      )}
                    </div>

                    {/* Reasoning Complexity Track */}
                    <div className="pt-3 border-t border-slate-100 space-y-1.5 bg-slate-50/60 -mx-5 -mb-5 p-4 rounded-b-2xl">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>Reasoning Complexity Track:</span>
                        {concept.lastAsked && (
                          <span className="text-[10px] font-normal text-slate-400">
                            Last practiced: {concept.lastAsked}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 text-[10px]">
                        {REASONING_COMPLEXITIES.map((comp) => {
                          const count = concept.reasoningTrack?.[comp] || 0;
                          const info = REASONING_COMPLEXITY_INFO[comp];

                          return (
                            <div
                              key={comp}
                              className={`p-1.5 rounded-lg border text-center transition-all ${
                                count >= 3
                                  ? 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold'
                                  : count >= 1
                                  ? 'bg-brand-50 border-brand-200 text-brand-800 font-semibold'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}
                              title={`${info.name}: ${info.description} (Score: ${count})`}
                            >
                              <div className="truncate font-medium text-[9px]">
                                {info.name.split(' ')[0]}
                              </div>
                              <div className="text-[11px] font-bold">
                                {count}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Complexity unlocks: <strong>Unseen</strong> (Direct inference) &bull; <strong>Learning</strong> (+Composition, Discrimination) &bull; <strong>Proficient+</strong> (All 7 complexities).
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
