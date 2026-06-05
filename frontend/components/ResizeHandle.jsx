'use client';

import { Separator } from 'react-resizable-panels';
import { useState, useEffect } from 'react';

export default function ResizeHandle({ id, style }) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const stop = () => setIsDragging(false);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchend', stop);
    };
  }, [isDragging]);

  return (
    <Separator
      id={id}
      style={{ width: '4px', flexShrink: 0, cursor: 'col-resize', outline: 'none', ...style }}
      onMouseDown={() => setIsDragging(true)}
      onTouchStart={() => setIsDragging(true)}
      className="resize-handle-outer"
    >
      <div
        className="resize-handle-bar"
        style={{
          height: '100%',
          width: '4px',
          background: isDragging ? 'rgb(147,51,234)' : 'transparent',
          transition: 'background 0.15s ease',
        }}
      />
    </Separator>
  );
}
