import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, Sparkles, Loader2 } from 'lucide-react';
import { Question, ChatMessage } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { sendChatMessage } from '../../lib/llm/factory';
import { saveChatMessage, getChatMessages } from '../../services/database';
import { ChatMessageItem } from './ChatMessageItem';

interface FollowUpChatProps {
  question: Question;
}

export const FollowUpChat: React.FC<FollowUpChatProps> = ({ question }) => {
  const { user, isDemoUser } = useAuth();
  const { settings } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!text || isSending || !user || !question.id) return;

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
      // Save user message to database
      await saveChatMessage(user.id, question.id, 'user', text);

      // Request response from LLM
      const replyText = await sendChatMessage(settings, question, updatedMessages, text, isDemoUser);

      // Save assistant message to database
      const savedAssistant = await saveChatMessage(user.id, question.id, 'assistant', replyText);

      setMessages((prev) => [...prev, savedAssistant]);
    } catch (err: unknown) {
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        questionId: question.id,
        userId: user.id,
        role: 'assistant',
        content: `⚠️ **Error communicating with ${settings.provider.toUpperCase()}**: ${
          err instanceof Error ? err.message : 'Something went wrong. Please check your API key in Settings.'
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

  const suggestedPrompts = [
    'Can you explain this with a simple real-world analogy?',
    'What would happen if the conditions were reversed?',
    'Could you break down the mathematical/scientific derivation?',
    'What is a common misconception about this topic?',
  ];

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
                {settings.provider} ({settings.model})
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              Ask follow-up questions to explore {question.topic} further
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-indigo-200 bg-white/10 px-3 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>LaTeX & Markdown Ready</span>
        </div>
      </div>

      {/* Messages Container */}
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
              Our AI tutor is tuned to the exact context of this &quot;Why&quot; question and can provide intuitive derivations, examples, or historical context.
            </p>

            {/* Quick Suggestion Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-w-lg mx-auto">
              {suggestedPrompts.map((promptText, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(promptText)}
                  className="text-xs bg-white hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 text-slate-700 border border-slate-200 rounded-full px-3.5 py-1.5 transition-all shadow-2xs text-left cursor-pointer"
                >
                  💬 {promptText}
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
          <span className="text-[11px] font-semibold text-slate-500 shrink-0">Suggestions:</span>
          {suggestedPrompts.slice(0, 2).map((promptText, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendMessage(promptText)}
              className="text-[11px] bg-white hover:bg-brand-50 hover:text-brand-700 text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 shrink-0 transition-colors cursor-pointer"
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
            disabled={isSending}
            placeholder={`Ask anything about this ${question.topic} question...`}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all bg-slate-50/50 focus:bg-white"
          />

          <button
            type="submit"
            disabled={!input.trim() || isSending}
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
