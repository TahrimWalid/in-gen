'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../app/store';
import { X, Send, ArrowRight } from 'lucide-react';

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
      className={`fixed top-0 right-0 h-full w-80 bg-surface border-l border-border shadow-2xl z-30 flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="bg-header-bg px-4 py-3 flex justify-between items-center shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <h3 className="font-bold text-header-text text-sm tracking-wide">AI Architect</h3>
          <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium leading-none">
            β
          </span>
        </div>
        <button onClick={onClose} className="text-muted hover:text-header-text transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-surface-alt">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 mt-4">
            <p className="text-xs text-muted text-center font-medium uppercase tracking-wide">
              Suggested questions
            </p>
            {STARTER_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="group text-left px-4 py-3 bg-surface border border-border rounded-xl text-sm text-secondary hover:border-purple-400 hover:bg-surface-hover transition-all shadow-sm flex items-start justify-between gap-2"
              >
                <span>{q}</span>
                <ArrowRight className="w-4 h-4 text-muted group-hover:text-purple-500 shrink-0 mt-0.5 transition-colors" />
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <span className="text-xs text-muted font-medium px-1">
                {msg.role === 'user' ? 'You' : msg.isError ? 'System' : 'AI Architect'}
              </span>
              <div
                className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-2xl rounded-br-sm'
                    : msg.isError
                    ? 'bg-red-50 text-red-800 border border-red-200 rounded-2xl rounded-bl-sm'
                    : 'bg-surface text-primary border border-border shadow-sm rounded-2xl rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-xs text-muted px-1">{formatTime(msg.timestamp)}</span>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex flex-col gap-1 items-start">
            <span className="text-xs text-muted font-medium px-1">AI Architect</span>
            <div className="px-4 py-3 bg-surface border border-border shadow-sm rounded-2xl rounded-bl-sm">
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border bg-surface shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your architecture..."
            rows={1}
            className="flex-1 px-3 py-2.5 border border-border-input rounded-xl text-sm text-input-text bg-input-bg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            style={{ maxHeight: '96px', overflowY: 'auto' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="w-9 h-9 bg-purple-600 text-white rounded-full hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
