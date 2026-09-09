import { AlertCircle, ArrowRight, Key, Settings as SettingsIcon } from 'lucide-react';
import { FollowUpChat } from '../../../components/chat/FollowUpChat';
import { JourneyExplorer } from '../../../components/concepts/JourneyExplorer';
import { QuestionCard } from '../../../components/question/QuestionCard';
import { QuestionGeneration } from '../../../components/question/QuestionGeneration';
import type { AppController } from '../../hooks/useAppController';

function ApiKeyBanner({ app }: { app: AppController }) {
    const { auth, settings, dialogs } = app;
    if (settings.settings.hasApiKey || settings.loading || settings.error) {
        return null;
    }

    return (
        <div className="bg-white bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-indigo-500/10 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                    <Key className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                    <h3 className="font-bold text-sm text-slate-900">
                        {auth.isDemoUser ? 'Explorer Preview Mode' : 'Configure Your Gemini API Key'}
                    </h3>
                    <p className="text-xs text-slate-600">
                        {auth.isDemoUser
                            ? 'Local sample questions and scripted tutor replies. Sign in with Google for live Gemini learning.'
                            : 'Live questions and answers are verified by the learning backend. Add your Gemini API key in Settings.'}
                    </p>
                </div>
            </div>
            {!auth.isDemoUser && (
                <button
                    type="button"
                    onClick={dialogs.openSettings}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-xs shadow-xs transition-all shrink-0 cursor-pointer"
                >
                    <span>Add API Key</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

function LearningErrorAlert({ app }: { app: AppController }) {
    const { learning, dialogs } = app;
    if (!learning.errorMessage) {
        return null;
    }

    return (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs sm:text-sm flex flex-wrap items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="font-bold">
                    {learning.errorNeedsApiKey ? 'Check your Gemini key' : 'Couldn’t load a question'}
                </p>
                <p className="mt-0.5">{learning.errorMessage}</p>
            </div>
            {learning.errorNeedsApiKey && (
                <button
                    type="button"
                    onClick={dialogs.openSettings}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 cursor-pointer"
                >
                    Open Settings
                </button>
            )}
            <button
                type="button"
                onClick={() => void learning.retryQuestion()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition-colors shrink-0 cursor-pointer"
            >
                Retry
            </button>
        </div>
    );
}

function ApiKeyOnboarding({ onOpenSettings }: { onOpenSettings: () => void }) {
    return (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto shadow-2xs">
                <Key className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
                <h2 className="text-xl font-bold text-slate-900">Add your Gemini key to get started</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                    Add your Gemini API key to generate live questions. Your key is encrypted in Supabase Vault;
                    answers are checked by the learning backend.
                </p>
            </div>
            <div className="pt-2">
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-6 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold text-sm shadow-md shadow-brand-500/20 inline-flex items-center gap-2 transition-all cursor-pointer"
                >
                    <SettingsIcon className="w-4 h-4" />
                    <span>Configure Gemini Settings</span>
                </button>
            </div>
        </div>
    );
}

function ActiveQuestion({ app }: { app: AppController }) {
    const { learning } = app;
    const question = learning.currentQuestion!;

    return (
        <div key={question.id} className={`space-y-6 ${!learning.isAnswered ? 'question-arrival' : ''}`}>
            {learning.questionExpired && (
                <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
                    <div>
                        <p className="font-bold">Ready for a fresh question?</p>
                        <p className="mt-1">
                            This question timed out while you were away. Your progress is safe. This answer wasn’t
                            scored, and no Resources were added or taken away.
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={learning.isLoadingQuestion}
                        onClick={() => void learning.refreshExpiredQuestion()}
                        className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                        {learning.isLoadingQuestion ? 'Getting a fresh question…' : 'Get a fresh question'}
                    </button>
                </div>
            )}
            {learning.submissionError && (
                <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
                    <p>{learning.submissionError}</p>
                    <p className="mt-1 font-bold">
                        Select the same answer again to recover the result. Each question earns Resources only once.
                    </p>
                </div>
            )}
            {learning.milestones.length > 0 && (
                <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 space-y-1">
                    {learning.milestones.map(milestone => (
                        <p key={milestone} className="text-sm font-semibold">✦ {milestone}</p>
                    ))}
                </div>
            )}
            <QuestionCard
                reward={learning.reward}
                isCollecting={learning.isCollecting}
                onCollect={source => void learning.collectReward(source)}
                collectionError={learning.collectionError}
                question={question}
                isAnswered={learning.isAnswered}
                isExpired={learning.questionExpired}
                selectedOption={learning.selectedOption}
                onAnswer={learning.submitAnswer}
                onNextQuestion={() => void learning.nextQuestion()}
                onChooseTopic={learning.resetHome}
                isLoadingNext={learning.isLoadingQuestion}
                availableTopics={[]}
                onScrollToChat={learning.scrollToChat}
            />
            {learning.isAnswered && (
                <div className="pt-2 animate-fade-in">
                    <FollowUpChat question={question} />
                </div>
            )}
        </div>
    );
}

function LearningStage({ app }: { app: AppController }) {
    const { auth, settings, learning, navigation } = app;
    const userId = auth.user?.id;
    if (!userId) {
        return null;
    }

    if (learning.pendingLoading) {
        return (
            <div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-600">
                Checking for uncollected Resources…
            </div>
        );
    }

    if (learning.pendingLoadError) {
        return (
            <div role="alert" className="rounded-2xl bg-white p-6 text-sm text-rose-700">
                {learning.pendingLoadError}
                <button
                    type="button"
                    onClick={learning.retryPendingRewardLoad}
                    className="ml-3 font-bold underline"
                >
                    Retry Resources
                </button>
            </div>
        );
    }

    if (settings.loading && !auth.isDemoUser && !learning.currentQuestion) {
        return (
            <div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-600">
                Checking your Gemini connection…
            </div>
        );
    }

    if (!settings.settings.hasApiKey && !settings.error && !auth.isDemoUser
        && !learning.currentQuestion && !learning.isLoadingQuestion) {
        return <ApiKeyOnboarding onOpenSettings={app.dialogs.openSettings} />;
    }

    if (learning.isLoadingQuestion) {
        return <QuestionGeneration topic={learning.pendingTopic} isDemo={auth.isDemoUser} />;
    }

    if (learning.learningDone) {
        return (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 space-y-4">
                <p role="status" className="font-bold text-emerald-900">{learning.learningDone}</p>
                <div className="flex gap-3">
                    <button
                        type="button"
                        className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white"
                        onClick={() => navigation.setView('castle')}
                    >
                        Go to Castle
                    </button>
                    <button
                        type="button"
                        className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
                        onClick={learning.resetHome}
                    >
                        Choose a topic
                    </button>
                </div>
            </section>
        );
    }

    if (learning.currentQuestion) {
        return <ActiveQuestion app={app} />;
    }

    return (
        <JourneyExplorer
            userId={userId}
            isDemo={auth.isDemoUser}
            topic={learning.learningTopic}
            revision={learning.journeyRevision}
            knowledgeOnly={learning.knowledgeOnly}
            onTopic={learning.setLearningTopic}
            disabled={!!learning.learningBlocked}
            onStart={(topic, target) => void learning.fetchNewQuestion(topic, target)}
        />
    );
}

export function LearningDeck({ app }: { app: AppController }) {
    return (
        <div id="learning-deck" tabIndex={-1} className="min-w-0 space-y-6 order-first w-full">
            <ApiKeyBanner app={app} />
            <LearningErrorAlert app={app} />
            <LearningStage app={app} />
        </div>
    );
}
