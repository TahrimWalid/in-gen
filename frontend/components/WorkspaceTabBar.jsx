'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../app/store';
import { Plus, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '../app/useTheme';

export default function WorkspaceTabBar() {
  const workspaces = useStore(state => state.workspaces);
  const activeWorkspaceId = useStore(state => state.activeWorkspaceId);
  const saveStatus = useStore(state => state.saveStatus);
  const switchWorkspace = useStore(state => state.switchWorkspace);
  const newWorkspace = useStore(state => state.newWorkspace);
  const deleteWorkspace = useStore(state => state.deleteWorkspace);
  const renameWorkspace = useStore(state => state.renameWorkspace);

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);
  const { theme, toggle: toggleTheme } = useTheme();

  const atLimit = workspaces.length >= 3;

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleTabClick = (id) => {
    if (id === activeWorkspaceId || renamingId) return;
    switchWorkspace(id);
  };

  const handleDoubleClick = (ws, e) => {
    e.stopPropagation();
    setRenamingId(ws.id);
    setRenameValue(ws.name);
  };

  const commitRename = () => {
    if (renamingId) {
      renameWorkspace(renamingId, renameValue);
    }
    setRenamingId(null);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setRenamingId(null);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    deleteWorkspace(id);
  };

  const handleNew = () => {
    if (!atLimit) newWorkspace();
  };

  return (
    <div className="flex items-center gap-1.5 h-full min-w-0 overflow-hidden">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="h-8 w-8 shrink-0 bg-surface border border-border text-secondary rounded-md hover:bg-surface-hover transition-all flex items-center justify-center"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </button>

      <div className="w-px h-5 bg-border shrink-0" />

      {/* Workspace tabs */}
      {workspaces.map(ws => {
        const isActive = ws.id === activeWorkspaceId;
        const isRenaming = renamingId === ws.id;

        return (
          <div
            key={ws.id}
            onClick={() => handleTabClick(ws.id)}
            className={`group relative flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium cursor-pointer select-none transition-all shrink-0 max-w-[160px] min-w-0 ${
              isActive
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/40'
                : 'text-muted hover:text-secondary hover:bg-surface-hover border border-transparent'
            }`}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={e => e.stopPropagation()}
                className="bg-transparent text-xs focus:outline-none w-full min-w-0"
                style={{ maxWidth: '110px' }}
              />
            ) : (
              <span
                className="truncate flex-1 min-w-0"
                title={ws.name}
                onDoubleClick={e => handleDoubleClick(ws, e)}
              >
                {ws.name}
              </span>
            )}
            <button
              onClick={e => handleDelete(ws.id, e)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all"
              title="Close workspace"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* New workspace */}
      <button
        onClick={handleNew}
        disabled={atLimit}
        title={atLimit ? 'Maximum 3 workspaces' : 'New workspace'}
        className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border border-dashed border-border text-muted hover:text-secondary hover:border-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-border shrink-0" />

      {/* Save status */}
      {saveStatus === 'saving' && <span className="text-xs text-muted shrink-0">Saving...</span>}
      {saveStatus === 'saved' && <span className="text-xs text-emerald-500 shrink-0">Saved</span>}
    </div>
  );
}
