import { Background, Controls, ReactFlow } from "@xyflow/react";

export function Canvas() {
  return (
    <main className="canvas">
      <ReactFlow nodes={[]} edges={[]}>
        <Background />
        <Controls />
      </ReactFlow>
    </main>
  );
}
