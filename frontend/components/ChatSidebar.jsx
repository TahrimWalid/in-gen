'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../app/store';
import { X, Send } from 'lucide-react';

const STARTER_QUESTIONS = [
  'What are the biggest risks in this architecture?',
  'What am I missing for a production-ready setup?',
  'How would this architecture handle a 10× traffic spike?',
];

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function ChatSidebar({ isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: 'user', content: trimmed, timestamp: new Date() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          graphState: { nodes, edges },
        }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [
          ...prev,
          { role: 'system', content: data.error, timestamp: new Date(), isError: true },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: data.content, timestamp: new Date() },
        ]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: 'Failed to reach the LLM endpoint. Check your .env.local configuration.',
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, nodes, edges, isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div
      className={`fixed top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white text-sm">AI Architect</h3>
          <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 font-mono">
            β
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 mt-4">
            <p className="text-xs text-slate-500 text-center font-medium uppercase tracking-wide">
              Suggested questions
            </p>
            {STARTER_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-left px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-purple-300 hover:bg-purple-50 transition-colors shadow-sm"
              >
                {q}
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white'
                    : msg.isError
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : 'bg-white text-slate-800 border border-slate-200 shadow-sm'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-xs text-slate-400">{formatTime(msg.timestamp)}</span>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-start">
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your architecture..."
            rows={1}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            style={{ maxHeight: '96px', overflowY: 'auto' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
