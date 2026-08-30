import React from 'react';
import { Bot, User as UserIcon } from 'lucide-react';
import { ChatMessage } from '../../types';
import { MathMarkdown } from '../common/MathMarkdown';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex items-start gap-3 w-full animate-fade-in ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      <div
        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 shadow-2xs border ${
          isUser
            ? 'bg-brand-600 text-white border-brand-700'
            : 'bg-gradient-to-br from-indigo-500 to-brand-600 text-white border-indigo-600'
        }`}
      >
        {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div
        className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
          isUser
            ? 'bg-brand-600 text-white rounded-tr-none'
            : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-none'
        }`}
      >
        <div className={isUser ? 'text-white' : 'text-slate-800'}>
          <MathMarkdown
            content={message.content}
            className={isUser ? '[&_strong]:text-white [&_code]:bg-brand-700/50 [&_code]:text-white [&_p]:text-white' : ''}
          />
        </div>
        {message.createdAt && (
          <div
            className={`text-[10px] mt-1.5 ${
              isUser ? 'text-brand-200 text-right' : 'text-slate-400 text-left'
            }`}
          >
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
};
