import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Bot, Sparkles, Loader2 } from 'lucide-react';
import { Question, ChatMessage } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { sendChatMessage } from '../../lib/llm/factory';
import { saveChatMessage, getChatMessages } from '../../services/database';
import { sendServerChatMessage } from '../../services/backend';
import { getSuggestedQuestionsForQuestion } from '../../lib/llm/suggestedQuestions';
import { ChatMessageItem } from './ChatMessageItem';
import { MathMarkdown } from '../common/MathMarkdown';

interface FollowUpChatProps {
  question: Question;
}

export const FollowUpChat: React.FC<FollowUpChatProps> = ({ question }) => {
  const { user, isDemoUser } = useAuth();
  const isSampleChat = isDemoUser;
  const { settings } = useSettings();
  const chatUnavailable = !isDemoUser && !settings.hasApiKey;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestedPrompts = useMemo(() => {
    return getSuggestedQuestionsForQuestion(question);
  }, [question]);

  // Load existing messages when question changes
  useEffect(() => {
    let isMounted = true;
    if (question.id && user) {
      setLoadingHistory(true);
      getChatMessages(user.id, question.id)
        .then((msgs) => {
          if (isMounted) {
            setMessages(msgs);
            setLoadingHistory(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoadingHistory(false);
        });
    } else {
      setMessages([]);
    }

    return () => {
      isMounted = false;
    };
  }, [question.id, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isSending || chatUnavailable || !user || !question.id) return;

    setInput('');
    setIsSending(true);

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `tmp_${Date.now()}`,
      questionId: question.id,
      userId: user.id,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...messages, tempUserMsg];
    setMessages(updatedMessages);

    try {
      const savedAssistant = isDemoUser
        ? await (async () => {
            await saveChatMessage(user.id, question.id!, 'user', text);
            const replyText = await sendChatMessage(
              { apiKey: '', hasApiKey: false },
              question,
              updatedMessages,
              text,
              true
            );
            return saveChatMessage(user.id, question.id!, 'assistant', replyText);
          })()
        : await sendServerChatMessage(question.id, text);

      setMessages((prev) => [...prev, savedAssistant]);
    } catch (err: unknown) {
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        questionId: question.id,
        userId: user.id,
        role: 'assistant',
        content: `⚠️ **Tutor error**: ${
          err instanceof Error ? err.message : 'Something went wrong. Please try again.'
        }`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      id="follow-up-chat-section"
      className="bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden flex flex-col transition-all duration-300"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
              <span>Deep-Dive Chat</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">
                {isSampleChat ? 'Sample replies · Demo' : 'Gemini'}
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              {isSampleChat ? 'Scripted preview replies. Sign in with Google for the live Gemini tutor.' : `Ask follow-up questions to explore ${question.topic} further`}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-indigo-200 bg-white/10 px-3 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{isSampleChat ? 'Demo preview' : chatUnavailable ? 'Key required' : 'AI Tutor Ready'}</span>
        </div>
      </div>

      {/* Messages Container */}
      {chatUnavailable && <p role="status" className="bg-amber-50 px-6 py-3 text-sm text-amber-900">Live tutor unavailable: configure a Gemini key in Settings to send messages. Saved conversations are still readable.</p>}
      <div className="p-4 sm:p-6 space-y-4 max-h-[420px] overflow-y-auto bg-slate-50/50">
        {loadingHistory ? (
          <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
            <span>Loading conversation...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-6 px-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-slate-800 text-sm">Have a question on this concept?</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Explore key terms, formulas, and conceptual mechanisms with Curious-Y tutor.
            </p>

            {/* Quick Suggestion Pills */}
            <div className="flex flex-col items-stretch sm:grid sm:grid-cols-2 gap-2 pt-1 max-w-xl mx-auto">
              {suggestedPrompts.map((promptText, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isSending || chatUnavailable}
                  onClick={() => handleSendMessage(promptText)}
                  className="text-xs bg-white hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 text-slate-700 border border-slate-200 rounded-2xl px-3.5 py-2.5 transition-all shadow-2xs text-left cursor-pointer flex items-start gap-2 group"
                >
                  <span className="shrink-0 text-brand-500 group-hover:scale-110 transition-transform">💬</span>
                  <div className="flex-1 pointer-events-none">
                    <MathMarkdown content={promptText} className="text-xs !leading-snug" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
        )}

        {isSending && (
          <div className="flex items-center gap-2.5 text-slate-500 text-xs pl-2 py-1 animate-pulse">
            <Bot className="w-4 h-4 text-brand-600 animate-bounce-short" />
            <span>Curious-Y tutor is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts if chat already started */}
      {messages.length > 0 && !isSending && (
        <div className="px-6 py-2 bg-slate-100/70 border-t border-slate-200/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-500 shrink-0">Related terms:</span>
          {suggestedPrompts.slice(0, 2).map((promptText, i) => (
            <button
              key={i}
              type="button"
              disabled={isSending || chatUnavailable}
                  onClick={() => handleSendMessage(promptText)}
              className="text-[11px] bg-white hover:bg-brand-50 hover:text-brand-700 text-slate-600 border border-slate-200 rounded-full px-3 py-1 shrink-0 transition-colors cursor-pointer max-w-xs truncate"
            >
              {promptText}
            </button>
          ))}
        </div>
      )}

      {/* Input Field */}
      <div className="p-4 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending || chatUnavailable}
            placeholder={`Ask anything about this ${question.topic} question...`}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all bg-slate-50/50 focus:bg-white"
          />

          <button
            type="submit"
            disabled={!input.trim() || isSending || chatUnavailable}
            className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-medium text-sm flex items-center justify-center gap-1.5 transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span className="hidden sm:inline">Ask</span>
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
