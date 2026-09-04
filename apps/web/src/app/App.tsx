import { ReactFlowProvider } from "@xyflow/react";
import { AppShell } from "./AppShell";

export function App() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}
