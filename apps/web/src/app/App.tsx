import { ReactFlowProvider } from "@xyflow/react";
import { PageTheme } from "../appearance/PageTheme";
import { AppShell } from "./AppShell";
import "../ui/controls.css";

export function App() {
  return (
    <ReactFlowProvider>
      <PageTheme />
      <AppShell />
    </ReactFlowProvider>
  );
}
