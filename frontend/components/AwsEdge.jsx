import React from 'react';
import { getBezierPath, EdgeLabelRenderer } from 'reactflow';

export default function AwsEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  selected, // 👈 ReactFlow passes this automatically when clicked
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* 1. The Invisible Hitbox: Thick and transparent for easy clicking */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
        className="react-flow__edge-interaction cursor-pointer"
      />
      
      {/* 2. The Visible Line: Changes color if selected */}
      <path
        id={id}
        style={style}
        fill="none"
        className={`react-flow__edge-path stroke-2 transition-colors duration-200 ${
          selected ? 'stroke-blue-500 animate-none' : 'stroke-slate-400 animate-pulse'
        }`}
        d={edgePath}
      />
      
      {/* Optional: Render a small label if the edge has data we want to show */}
      {data?.invocationType && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`nodrag nopan bg-white border px-2 py-1 rounded-md text-[10px] font-bold shadow-sm transition-colors ${
              selected ? 'border-blue-500 text-blue-600' : 'border-slate-200 text-slate-500'
            }`}
          >
            {data.invocationType}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}