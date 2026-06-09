'use client';

import { useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ingen-theme') || 'light';
    }
    return 'light';
  });

  const toggle = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ingen-theme', next);
      return next;
    });
  };

  return { theme, toggle };
}
