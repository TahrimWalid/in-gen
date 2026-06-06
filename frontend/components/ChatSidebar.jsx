'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../app/store';
import { X, Send, ArrowRight, LayoutTemplate, Zap, Sparkles, Square } from 'lucide-react';
import DiagramConfirmModal from './DiagramConfirmModal';

const STARTER_QUESTIONS = [
  'What are the biggest risks in this architecture?',
  'What am I missing for a production-ready setup?',
  'How would this architecture handle a 10× traffic spike?',
];

const THINK_MODE_KEY = 'ingen-think-mode';

const GENERATION_KEYWORDS = ['build', 'create', 'design', 'generate', 'make', 'architect', 'set up', 'deploy', 'implement'];
const EXTENSION_KEYWORDS = ['add', 'extend', 'fix', 'update', 'include', 'integrate', 'enhance', 'improve', 'modify', 'now add', 'also add'];

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isGenerationOrExtensionIntent(text) {
  const lower = text.toLowerCase();
  return GENERATION_KEYWORDS.some(kw => lower.includes(kw)) ||
         EXTENSION_KEYWORDS.some(kw => lower.includes(kw));
}

export default function ChatSidebar({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [modeNotice, setModeNotice] = useState(null);
  const [loadingText, setLoadingText] = useState(null);

  const messagesEndRef = useRef(null);
  const modeNoticeTimerRef = useRef(null);
  const loadingTimersRef = useRef([]);
  const abortControllerRef = useRef(null);
  const hasInitializedRef = useRef(false);

  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const issues = useStore(state => state.issues || []);
  const streamNodes = useStore(state => state.streamNodes);
  const applyPropertyUpdates = useStore(state => state.applyPropertyUpdates);
  const setSourceHcl = useStore(state => state.setSourceHcl);
  const updateWorkspaceMessages = useStore(state => state.updateWorkspaceMessages);
  const getCurrentWorkspace = useStore(state => state.getCurrentWorkspace);

  // Read thinking mode preference on mount + wire workspace-switched event
  useEffect(() => {
    try {
      if (localStorage.getItem(THINK_MODE_KEY) === 'true') setThinkingMode(true);
    } catch { /* ignore */ }

    // Initial messages: read directly from store (avoids race with workspace-switched event)
    const ws = getCurrentWorkspace();
    if (ws?.messages?.length > 0) {
      setMessages(ws.messages);
    }
    hasInitializedRef.current = true;

    // Subsequent workspace switches come via event
    const onSwitch = (e) => {
      setMessages(e.detail?.messages || []);
    };
    window.addEventListener('workspace-switched', onSwitch);

    return () => {
      window.removeEventListener('workspace-switched', onSwitch);
      clearTimeout(modeNoticeTimerRef.current);
      loadingTimersRef.current.forEach(id => clearTimeout(id));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist messages to active workspace after every change
  useEffect(() => {
    if (!hasInitializedRef.current) return;
    updateWorkspaceMessages(messages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isStreaming]);

  const handleStop = useCallback(() => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    loadingTimersRef.current.forEach(id => clearTimeout(id));
    loadingTimersRef.current = [];
    setLoadingText(null);
    setIsLoading(false);
    setMessages(prev => [
      ...prev,
      { role: 'system', content: 'Response cancelled.', timestamp: new Date() },
    ]);
  }, []);

  const toggleThinkingMode = useCallback(() => {
    setThinkingMode(prev => {
      const next = !prev;
      try { localStorage.setItem(THINK_MODE_KEY, String(next)); } catch { /* ignore */ }
      clearTimeout(modeNoticeTimerRef.current);
      setModeNotice(next
        ? 'Pro mode enabled — responses will be slower but more thorough'
        : 'Fast mode enabled — instant responses'
      );
      modeNoticeTimerRef.current = setTimeout(() => setModeNotice(null), 3000);
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || isStreaming) return;

    const userMsg = { role: 'user', content: trimmed, timestamp: new Date() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    if (isGenerationOrExtensionIntent(trimmed)) {
      setLoadingText('Designing your architecture... this may take a moment');
      loadingTimersRef.current = [
        setTimeout(() => setLoadingText('Still thinking — complex architectures take longer to plan correctly'), 10000),
        setTimeout(() => setLoadingText('Almost there — finalizing the architecture design'), 30000),
      ];
    } else {
      setLoadingText(null);
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          graphState: { nodes, edges, validationIssues: issues },
          thinkingMode,
        }),
      });
      const data = await res.json();

      if (data.cancelled) return;

      if (data.error) {
        setMessages(prev => [
          ...prev,
          { role: 'system', content: data.error, timestamp: new Date(), isError: true },
        ]);
      } else if (data.type === 'terraform_generation') {
        let parseResult;
        try {
          const parseRes = await fetch('/api/parse-hcl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hcl: data.hcl }),
          });
          parseResult = await parseRes.json();
        } catch {
          setMessages(prev => [
            ...prev,
            { role: 'system', content: 'Failed to contact parse server.', timestamp: new Date(), isError: true },
          ]);
          return;
        }
        const { nodes: parsedNodes, edges: parsedEdges, errors: parseErrors } = parseResult;
        if (parseErrors?.length > 0 && (!parsedNodes || parsedNodes.length === 0)) {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: 'Failed to parse generated Terraform. The model may have produced invalid HCL. Try again or switch to Pro mode for better output.',
              timestamp: new Date(),
            },
          ]);
        } else {
          setPendingGeneration({
            nodes: parsedNodes,
            edges: parsedEdges,
            description: data.description,
            hcl: data.hcl,
          });
        }
      } else if (data.type === 'diagram_generation') {
        setPendingGeneration(data);
      } else if (data.type === 'property_update') {
        applyPropertyUpdates(data.updates);
        const updatedLabels = data.updates.map(u => {
          const node = nodes.find(n => n.id === u.nodeId);
          const label = node?.data?.label || u.nodeId;
          const props = Object.keys(u.data).join(', ');
          return `${label} (${props})`;
        }).join(', ');
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Fixed: updated ${updatedLabels}. Validation is running.`,
            timestamp: new Date(),
            isGenerated: true,
          },
        ]);
      } else {
        const content = data.textResponse || data.content || '';
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content, timestamp: new Date() },
        ]);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
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
      abortControllerRef.current = null;
      loadingTimersRef.current.forEach(id => clearTimeout(id));
      loadingTimersRef.current = [];
      setLoadingText(null);
      setIsLoading(false);
    }
  }, [messages, nodes, edges, issues, isLoading, isStreaming, thinkingMode, applyPropertyUpdates]);

  const handleConfirm = useCallback(async (replace) => {
    const gen = pendingGeneration;
    setPendingGeneration(null);
    setIsStreaming(true);

    try {
      await streamNodes(gen.nodes, gen.edges, replace, gen.description);
      if (gen.hcl) setSourceHcl(gen.hcl);
    } finally {
      setIsStreaming(false);
    }

    const nodeCount = gen.nodes?.length || 0;
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: gen.hcl
          ? `Generated ${gen.description}. ${nodeCount} resources defined. Export will return the source HCL directly.`
          : `Generated: ${gen.description}. ${nodeCount} nodes placed on canvas. Validation is running.`,
        timestamp: new Date(),
        isGenerated: true,
      },
    ]);
  }, [pendingGeneration, streamNodes, setSourceHcl]);

  const handleCancel = useCallback(() => {
    const gen = pendingGeneration;
    setPendingGeneration(null);
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `I would have generated: ${gen.description}. Let me know if you'd like to proceed or want a different architecture.`,
        timestamp: new Date(),
      },
    ]);
  }, [pendingGeneration]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {pendingGeneration && (
        <DiagramConfirmModal
          generation={pendingGeneration}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      <div className="w-full h-full flex flex-col bg-surface border-l border-border shadow-2xl">
        <div className="bg-header-bg px-4 py-3 flex justify-between items-center shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-header-text text-sm tracking-wide">AI Architect</h3>
            <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium leading-none">
              β
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleThinkingMode}
              title={thinkingMode
                ? 'Deep reasoning — better for complex architecture generation'
                : 'Quick responses, no reasoning'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                thinkingMode
                  ? 'bg-purple-600/20 text-purple-400 border border-purple-500/50 shadow-[0_0_8px_rgba(147,51,234,0.4)]'
                  : 'text-muted hover:text-header-text'
              }`}
            >
              {thinkingMode ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Pro</span>
                </>
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onClose}
              title="Close (Ctrl+Shift+A)"
              className="text-muted hover:text-header-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {modeNotice && (
          <div className="px-4 py-2 text-xs text-center border-b border-border bg-surface text-secondary shrink-0">
            {modeNotice}
          </div>
        )}

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
                {msg.isGenerated ? (
                  <div className="flex items-center gap-1 px-1">
                    <LayoutTemplate className="w-3 h-3 text-purple-500" />
                    <span className="text-xs text-muted">{formatTime(msg.timestamp)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted px-1">{formatTime(msg.timestamp)}</span>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex flex-col gap-1 items-start">
              <span className="text-xs text-muted font-medium px-1">AI Architect</span>
              <div className="flex items-center gap-2">
                <div className="px-4 py-3 bg-surface border border-border shadow-sm rounded-2xl rounded-bl-sm">
                  {loadingText ? (
                    <span className="text-sm text-secondary">{loadingText}</span>
                  ) : (
                    <div className="flex gap-1.5 items-center">
                      <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleStop}
                  title="Stop generating"
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 border border-red-500/40 rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <Square className="w-3 h-3 fill-current" />
                  Stop
                </button>
              </div>
            </div>
          )}

          {isStreaming && (
            <div className="flex flex-col gap-1 items-start">
              <span className="text-xs text-muted font-medium px-1">AI Architect</span>
              <div className="px-4 py-3 bg-surface border border-border shadow-sm rounded-2xl rounded-bl-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-muted">Generating...</span>
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
              className="flex-1 px-4 py-2.5 border border-border-input rounded-xl text-sm text-input-text bg-input-bg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              style={{ maxHeight: '96px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading || isStreaming}
              className="w-9 h-9 bg-purple-600 text-white rounded-full hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
