'use client';

import { useState, useEffect } from 'react';

export function useTheme() {
  // Start at 'light' for both server and first client render to avoid a
  // hydration mismatch. The real value (from localStorage) is applied
  // via effect immediately after mount.
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    setTheme(localStorage.getItem('ingen-theme') || 'light');
  }, []);

  // Each component calls useTheme() independently with its own state.
  // Listen for changes triggered by other instances so all stay in sync.
  useEffect(() => {
    const handler = (e) => setTheme(e.detail.theme);
    window.addEventListener('theme-changed', handler);
    return () => window.removeEventListener('theme-changed', handler);
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ingen-theme', next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: next } }));
  };

  return { theme, toggle };
}
