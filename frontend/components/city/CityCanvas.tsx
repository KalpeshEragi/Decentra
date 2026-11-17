"use client";
// The 3D canvas with its failure modes handled, so the panel around it keeps working whatever the GPU does:
// - no WebGL in this browser: a plain message instead of a blank page;
// - an error while drawing the City: the error is shown with "Reload the 3D view" (the cards keep running);
// - the GPU drops the context (driver reset, too many tabs): "restoring" until the browser gives it back, then the
//   3D view is rebuilt; if it does not come back, a button rebuilds it by hand.

import { Canvas } from "@react-three/fiber";
import { Component, ReactNode, useEffect, useRef, useState } from "react";

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("City 3D view failed", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <CanvasNotice title="The 3D view stopped" text={this.state.error.message}
        action={{ label: "Reload the 3D view", run: () => { this.setState({ error: null }); this.props.onRetry(); } }} />
    );
  }
}

function CanvasNotice({ title, text, action }: { title: string; text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="city-notice" role="alert">
      <b>{title}</b>
      <span>{text}</span>
      {action && <button onClick={action.run}>{action.label}</button>}
    </div>
  );
}

export function CityCanvas({ children, onMissed }: { children: ReactNode; onMissed: () => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [generation, setGeneration] = useState(0);  // bumping it rebuilds the whole 3D view
  const [lost, setLost] = useState(false);
  const current = useRef(0);  // the generation on screen; a replaced canvas's events are ignored
  useEffect(() => setSupported(webglAvailable()), []);

  if (supported === null) return null;
  if (!supported) return <CanvasNotice title="3D is not available" text="This browser has WebGL turned off or unsupported. The cards still show the live data; try a current Chrome, Edge or Firefox with hardware acceleration on." />;
  const rebuild = () => { current.current += 1; setLost(false); setGeneration(current.current); };
  return (
    <SceneBoundary onRetry={rebuild}>
      <Canvas key={generation} shadows dpr={[1, 1.75]} camera={{ fov: 40, near: 5, far: 5000, position: [-200, 250, 260] }}
        gl={{ antialias: true }} onPointerMissed={onMissed}
        onCreated={({ gl }) => {
          // disposing a replaced canvas forces its context lost too: only the canvas on screen may report a loss
          const el = gl.domElement, mine = current.current;
          el.addEventListener("webglcontextlost", (e) => { if (mine !== current.current) return; e.preventDefault(); setLost(true); });
          el.addEventListener("webglcontextrestored", () => { if (mine === current.current) rebuild(); });
        }}>
        {children}
      </Canvas>
      {lost && <CanvasNotice title="Graphics reset" text="The GPU dropped the 3D view. Restoring…" action={{ label: "Rebuild now", run: rebuild }} />}
    </SceneBoundary>
  );
}
