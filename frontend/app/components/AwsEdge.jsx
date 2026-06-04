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
      <path
        id={id}
        style={style}
        className="react-flow__edge-path stroke-2 stroke-slate-400 animate-pulse"
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
            className="nodrag nopan bg-white border border-slate-200 px-2 py-1 rounded-md text-[10px] font-bold text-slate-500 shadow-sm"
          >
            {data.invocationType}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}