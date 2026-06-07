'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../app/store';
import { useTheme } from '../app/useTheme';
import { X, Send, Zap, Sparkles, Square } from 'lucide-react';
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
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [modeNotice, setModeNotice] = useState(null);
  const [loadingText, setLoadingText] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
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

  // Auto-resize the input textarea between min and max height as the user types
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

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

      <div className={`w-full h-full flex flex-col border-l border-border shadow-2xl ${theme === 'light' ? 'bg-gray-50' : 'bg-surface'}`}>
        <div className="bg-header-bg px-4 py-3 flex justify-between items-center shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-header-text text-[15px] tracking-tight">AI Architect</h3>
            <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-[8px] font-semibold leading-none tracking-wide">
              β
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleThinkingMode}
              title={thinkingMode
                ? 'Pro mode — deep reasoning for complex architecture generation'
                : 'Fast mode — quick responses, no reasoning'
              }
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                thinkingMode
                  ? 'bg-purple-600/20 text-purple-400 shadow-[0_0_8px_rgba(147,51,234,0.4)]'
                  : 'text-muted hover:text-header-text hover:bg-white/5'
              }`}
            >
              {thinkingMode ? <Sparkles className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              title="Close (Ctrl+Shift+A)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-header-text hover:bg-white/5 transition-colors"
            >
              <X className="w-[18px] h-[18px]" />
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
            <div className="flex flex-col gap-6 mt-6">
              <div className="flex flex-col items-center text-center gap-2 px-4">
                <Sparkles className="w-8 h-8 text-purple-400" />
                <h4 className="text-base font-medium text-primary mt-1">AI Architect</h4>
                <p className="text-sm text-muted leading-relaxed max-w-[260px]">
                  Ask anything about your AWS architecture or describe what you want to build.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <p className="text-[11px] text-muted text-center font-normal">
                  Try asking
                </p>
                {STARTER_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className={`group text-left pl-[15px] pr-4 py-3.5 rounded-xl text-[13px] leading-relaxed text-secondary border-l-[3px] border-l-purple-500 hover:-translate-y-0.5 transition-all duration-200 flex items-start gap-2.5 ${
                      theme === 'light'
                        ? 'bg-white border-y border-r border-gray-200 shadow-sm hover:shadow-md'
                        : 'bg-gradient-to-br from-surface to-surface-alt border-y border-r border-border hover:shadow-lg hover:shadow-purple-500/10 hover:from-surface hover:to-surface-hover'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              const isError = msg.isError;
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-1 ${isError ? 'items-center' : isUser ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-xs text-muted font-medium px-1">
                    {isUser ? 'You' : isError ? 'System' : 'AI Architect'}
                  </span>
                  <div
                    className={`text-sm leading-relaxed px-4 py-3 ${
                      isUser
                        ? 'max-w-[85%] text-white shadow-md bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px]'
                        : isError
                        ? 'w-full text-center text-red-600 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)]'
                        : 'max-w-[90%] text-primary bg-surface border border-border rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px]'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div className={`flex items-center gap-1.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[11px] text-muted">{formatTime(msg.timestamp)}</span>
                    {msg.isGenerated && (
                      <span className="text-[10px] font-medium text-white bg-purple-600 px-2 py-0.5 rounded-full leading-none">
                        Generated
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex flex-col gap-1 items-start">
              <span className="text-xs text-muted font-medium px-1">AI Architect</span>
              <div className="flex items-end gap-2">
                <div className="max-w-[90%] px-4 py-3 bg-surface border border-border rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px] flex flex-col gap-2">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {loadingText && (
                    <span className="text-xs text-secondary">{loadingText}</span>
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
              <div className="max-w-[90%] px-4 py-3 bg-surface border border-border rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 items-center">
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

        <div className={`px-4 py-4 border-t shrink-0 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-surface border-border'}`}>
          <div className="relative flex items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your architecture..."
              rows={1}
              className="w-full resize-none rounded-xl border border-border-input bg-surface text-sm text-input-text placeholder:text-muted pl-4 pr-12 py-3 min-h-[44px] max-h-[120px] focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition-colors duration-150"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading || isStreaming}
              title="Send message"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors duration-150 ${
                input.trim() && !isLoading && !isStreaming
                  ? 'bg-purple-600 text-white hover:bg-purple-500'
                  : 'bg-surface-hover text-muted cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
