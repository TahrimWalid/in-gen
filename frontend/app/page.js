'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import Canvas from '@/components/Canvas';
import Sidebar from '@/components/Sidebar';
import ChatSidebar from '@/components/ChatSidebar';
import HclEditor from '@/components/HclEditor';
import ResizeHandle from '@/components/ResizeHandle';

const LEFT_WIDTH_KEY = 'ingen-sidebar-left-width';
const LEFT_COLLAPSED_KEY = 'ingen-sidebar-left-collapsed';
const RIGHT_WIDTH_KEY = 'ingen-sidebar-right-width';
const EDITOR_WIDTH_KEY = 'ingen-editor-width';

const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 340;
const DEFAULT_EDITOR_WIDTH = 380;
const LEFT_COLLAPSED_SIZE = 48;

function readLocalInt(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);

  // 'none' | 'editor' | 'chat' — which tool is visible in the right panel
  // Ref avoids stale closure issues in callbacks; state drives the render
  const rightViewRef = useRef('none');
  const [rightView, setRightView] = useState('none');

  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);

  const setView = useCallback((v) => {
    rightViewRef.current = v;
    setRightView(v);
  }, []);

  // After hydration, restore left panel size from localStorage
  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    if (leftPanel) {
      const collapsed = localStorage.getItem(LEFT_COLLAPSED_KEY) === 'true';
      if (collapsed) {
        leftPanel.collapse();
      } else {
        const saved = readLocalInt(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH);
        if (saved !== DEFAULT_LEFT_WIDTH) leftPanel.resize(saved);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLeftSidebar = useCallback(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.resize(readLocalInt(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH));
    } else {
      panel.collapse();
    }
  }, []);

  const closeRightPanel = useCallback(() => {
    setView('none');
    rightPanelRef.current?.collapse();
  }, [setView]);

  const toggleEditor = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightViewRef.current === 'editor') {
      setView('none');
      panel.collapse();
    } else {
      setView('editor');
      panel.resize(readLocalInt(EDITOR_WIDTH_KEY, DEFAULT_EDITOR_WIDTH));
    }
  }, [setView]);

  const toggleChat = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightViewRef.current === 'chat') {
      setView('none');
      panel.collapse();
    } else {
      setView('chat');
      panel.resize(readLocalInt(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH));
    }
  }, [setView]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        toggleLeftSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'e') {
        e.preventDefault();
        toggleEditor();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleLeftSidebar, toggleEditor, toggleChat]);

  const handleLeftResize = useCallback((size) => {
    const px = size.inPixels;
    const collapsed = px <= LEFT_COLLAPSED_SIZE;
    setIsLeftCollapsed(collapsed);
    localStorage.setItem(LEFT_COLLAPSED_KEY, String(collapsed));
    if (!collapsed) localStorage.setItem(LEFT_WIDTH_KEY, String(Math.round(px)));
  }, []);

  const handleRightResize = useCallback((size) => {
    const px = size.inPixels;
    if (px <= 10) {
      // Dragged to closed — sync view state
      setView('none');
      return;
    }
    const view = rightViewRef.current;
    if (view === 'chat') localStorage.setItem(RIGHT_WIDTH_KEY, String(Math.round(px)));
    if (view === 'editor') localStorage.setItem(EDITOR_WIDTH_KEY, String(Math.round(px)));
  }, [setView]);

  const isEditorOpen = rightView === 'editor';
  const isChatOpen = rightView === 'chat';
  const isRightOpen = rightView !== 'none';

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Group orientation="horizontal" className="h-full">
        <Panel
          id="left-sidebar"
          panelRef={leftPanelRef}
          defaultSize={DEFAULT_LEFT_WIDTH}
          minSize={200}
          maxSize={400}
          collapsible
          collapsedSize={LEFT_COLLAPSED_SIZE}
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleLeftResize}
        >
          <Sidebar collapsed={isLeftCollapsed} onToggle={toggleLeftSidebar} />
        </Panel>

        <ResizeHandle id="left-sep" />

        <Panel
          id="canvas"
          groupResizeBehavior="preserve-relative-size"
        >
          <Canvas
            onToggleChat={toggleChat}
            isChatOpen={isChatOpen}
            onToggleEditor={toggleEditor}
            isEditorOpen={isEditorOpen}
          />
        </Panel>

        <ResizeHandle
          id="right-sep"
          style={{ opacity: isRightOpen ? 1 : 0, pointerEvents: isRightOpen ? 'auto' : 'none' }}
        />

        <Panel
          id="right-panel"
          panelRef={rightPanelRef}
          defaultSize={0}
          minSize={280}
          maxSize={600}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleRightResize}
        >
          <div style={{ display: isEditorOpen ? 'flex' : 'none', width: '100%', height: '100%', flexDirection: 'column' }}>
            <HclEditor onClose={closeRightPanel} />
          </div>
          <div style={{ display: isChatOpen ? 'flex' : 'none', width: '100%', height: '100%', flexDirection: 'column' }}>
            <ChatSidebar onClose={closeRightPanel} />
          </div>
        </Panel>
      </Group>
    </main>
  );
}
