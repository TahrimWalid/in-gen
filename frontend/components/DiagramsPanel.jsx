'use client';

import React, { useState } from 'react';
import { useStore } from '../app/store';
import { X, Plus, Pencil, Trash2, FolderOpen, Check } from 'lucide-react';

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function DiagramsPanel({ isOpen, onClose }) {
  const { diagrams, activeDiagramId, loadDiagram, deleteDiagram, renameDiagram, newDiagram } = useStore();
  const [renamingId, setRenamingId] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const sorted = [...diagrams].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const handleRenameStart = (diagram, e) => {
    e.stopPropagation();
    setRenamingId(diagram.id);
    setRenameInput(diagram.name);
    setDeletingId(null);
  };

  const handleRenameCommit = () => {
    if (renamingId) renameDiagram(renamingId, renameInput);
    setRenamingId(null);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') handleRenameCommit();
    if (e.key === 'Escape') setRenamingId(null);
  };

  const handleDeleteClick = (id, e) => {
    e.stopPropagation();
    setDeletingId(id);
    setRenamingId(null);
  };

  const handleDeleteConfirm = (id, e) => {
    e.stopPropagation();
    deleteDiagram(id);
    setDeletingId(null);
  };

  const handleLoad = (id) => {
    if (id === activeDiagramId) return;
    loadDiagram(id);
    onClose();
  };

  const handleNew = () => {
    newDiagram();
    onClose();
  };

  return (
    <div
      className={`fixed top-0 left-0 h-full w-72 bg-surface border-r border-border shadow-2xl z-30 flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="bg-header-bg px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-header-text opacity-70" />
          <h3 className="font-bold text-header-text text-sm">My Diagrams</h3>
        </div>
        <button onClick={onClose} className="text-muted hover:text-header-text transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3 border-b border-border shrink-0">
        <button
          onClick={handleNew}
          className="w-full flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-md text-sm font-semibold hover:bg-purple-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Diagram
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-muted text-sm">No saved diagrams yet.</p>
            <p className="text-muted text-xs mt-1">Changes auto-save after 2 seconds.</p>
          </div>
        ) : (
          sorted.map(diagram => {
            const isActive = diagram.id === activeDiagramId;
            const isDeleting = deletingId === diagram.id;
            const isRenaming = renamingId === diagram.id;

            return (
              <div
                key={diagram.id}
                onClick={() => handleLoad(diagram.id)}
                className={`group relative px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-purple-500/10 border-l-2 border-l-purple-500'
                    : 'hover:bg-surface-hover'
                }`}
              >
                {isDeleting ? (
                  <div onClick={e => e.stopPropagation()} className="flex flex-col gap-2">
                    <p className="text-xs text-primary font-medium leading-relaxed">
                      Delete &ldquo;{diagram.name}&rdquo;? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => handleDeleteConfirm(diagram.id, e)}
                        className="flex-1 px-2 py-1 bg-red-600 text-white text-xs rounded font-semibold hover:bg-red-500 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                        className="flex-1 px-2 py-1 bg-surface border border-border text-secondary text-xs rounded font-semibold hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <input
                            type="text"
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onBlur={handleRenameCommit}
                            onKeyDown={handleRenameKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="w-full text-sm font-semibold text-primary bg-transparent border-b border-purple-500 focus:outline-none"
                          />
                        ) : (
                          <p className={`text-sm font-semibold truncate ${isActive ? 'text-purple-400' : 'text-primary'}`}>
                            {diagram.name}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted">{formatRelativeTime(diagram.updatedAt)}</span>
                          <span className="text-xs text-muted">·</span>
                          <span className="text-xs text-muted">{diagram.nodes.length} nodes</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {isRenaming ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRenameCommit(); }}
                            className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors"
                            title="Save name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleRenameStart(diagram, e)}
                            className="p-1 text-muted hover:text-secondary transition-colors"
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteClick(diagram.id, e)}
                          className="p-1 text-muted hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
