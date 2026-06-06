'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import Canvas from '@/components/Canvas';
import Sidebar from '@/components/Sidebar';
import ChatSidebar from '@/components/ChatSidebar';
import ResizeHandle from '@/components/ResizeHandle';

const LEFT_WIDTH_KEY = 'ingen-sidebar-left-width';
const LEFT_COLLAPSED_KEY = 'ingen-sidebar-left-collapsed';
const RIGHT_WIDTH_KEY = 'ingen-sidebar-right-width';

const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 340;
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

  // Consistent defaults for SSR/hydration — localStorage applied after mount in useEffect
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // After hydration, restore saved panel sizes via imperative API (avoids SSR mismatch)
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    const collapsed = localStorage.getItem(LEFT_COLLAPSED_KEY) === 'true';
    if (collapsed) {
      panel.collapse();
    } else {
      const saved = readLocalInt(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH);
      if (saved !== DEFAULT_LEFT_WIDTH) panel.resize(saved);
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

  const toggleChat = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.resize(readLocalInt(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH));
    } else {
      panel.collapse();
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        toggleLeftSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleLeftSidebar, toggleChat]);

  const handleLeftResize = useCallback((size) => {
    const px = size.inPixels;
    const collapsed = px <= LEFT_COLLAPSED_SIZE;
    setIsLeftCollapsed(collapsed);
    localStorage.setItem(LEFT_COLLAPSED_KEY, String(collapsed));
    if (!collapsed) localStorage.setItem(LEFT_WIDTH_KEY, String(Math.round(px)));
  }, []);

  const handleRightResize = useCallback((size) => {
    const px = size.inPixels;
    const open = px > 0;
    setIsChatOpen(open);
    if (open) localStorage.setItem(RIGHT_WIDTH_KEY, String(Math.round(px)));
  }, []);

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
          <Canvas onToggleChat={toggleChat} isChatOpen={isChatOpen} />
        </Panel>

        <ResizeHandle
          id="right-sep"
          style={{ opacity: isChatOpen ? 1 : 0, pointerEvents: isChatOpen ? 'auto' : 'none' }}
        />

        <Panel
          id="right-sidebar"
          panelRef={rightPanelRef}
          defaultSize={0}
          minSize={280}
          maxSize={520}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleRightResize}
        >
          <ChatSidebar onClose={() => rightPanelRef.current?.collapse()} />
        </Panel>
      </Group>
    </main>
  );
}
