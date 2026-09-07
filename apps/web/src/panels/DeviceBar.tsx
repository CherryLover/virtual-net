import { useReactFlow } from "@xyflow/react";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEVICE_LABELS } from "../engine";
import { DeviceIcon } from "../icons";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { IconButton } from "../ui/IconButton";
import { filterLibrary, libraryGroupCount } from "./libraryCatalog";
import { canDropLibraryDevice, type LibraryDrag, moveLibraryDrag } from "./libraryDrag";
import "./device-bar.css";

export function DeviceBar() {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { screenToFlowPosition } = useReactFlow();
  const open = useLayoutStore((s) => s.libraryOpen);
  const toggle = useLayoutStore((s) => s.toggleLibrary);
  const activeDrag = useRef<LibraryDrag | null>(null);
  const suppressClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<LibraryDrag | null>(null);
  useEffect(() => {
    const cancel = () => {
      if (!activeDrag.current) return;
      suppressClick.current = true;
      activeDrag.current = null;
      setDragPreview(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);
  const groups = filterLibrary(query);
  const search = (value: string) => {
    setQuery(value);
    setCollapsed(new Set());
  };
  return (
    <aside
      className={`device-bar${dragPreview ? " library-dragging" : ""}`}
      aria-label="设备库"
      hidden={!open}
    >
      {dragPreview
        ? createPortal(
            <div
              className="library-drag-preview"
              aria-hidden="true"
              style={{
                left: Math.min(dragPreview.point.x + 12, window.innerWidth - 154),
                top: Math.min(dragPreview.point.y + 12, window.innerHeight - 64),
              }}
            >
              <DeviceIcon type={dragPreview.type} className="device-icon" />
              <span>{DEVICE_LABELS[dragPreview.type]}</span>
            </div>,
            document.body,
          )
        : null}
      <div className="library-heading">
        <h2 className="device-bar-title">设备库</h2>
        <IconButton icon={X} label="收起设备库" onClick={toggle} />
      </div>
      <label className="library-search">
        <Search size={15} />
        <input
          aria-label="搜索设备"
          placeholder="搜索设备"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
        {query ? <IconButton icon={X} label="清除搜索" onClick={() => search("")} /> : null}
      </label>
      <div className="device-bar-list">
        {groups.map((group) => (
          <section key={group.id} className="library-group" aria-label={group.name}>
            <h3>
              <button
                type="button"
                className="library-group-toggle"
                aria-expanded={!collapsed.has(group.id)}
                aria-controls={`library-${group.id}`}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                <ChevronDown size={14} aria-hidden="true" />
                <span>{group.name}</span>
                <span className="library-count">{libraryGroupCount(group)}</span>
              </button>
            </h3>
            <div id={`library-${group.id}`} hidden={collapsed.has(group.id)}>
              {group.roles.map((role) => (
                <div className="library-role" key={role.name}>
                  <h4>{role.name}</h4>
                  {role.types.map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={`device-card${dragPreview?.type === type ? " device-card-dragging" : ""}`}
                      draggable={false}
                      data-device-type={type}
                      onClick={(event) => {
                        if (suppressClick.current && event.detail !== 0) {
                          suppressClick.current = false;
                          return;
                        }
                        suppressClick.current = false;
                        const bounds = document.querySelector(".canvas")?.getBoundingClientRect();
                        if (!bounds) return;
                        const position = screenToFlowPosition({
                          x: bounds.left + bounds.width / 2,
                          y: bounds.top + bounds.height / 2,
                        });
                        const offset =
                          (useTopologyStore.getState().topology.devices.length % 5) * 16;
                        useTopologyStore.getState().addDevice(type, {
                          x: Math.round((position.x - 70 + offset) / 16) * 16,
                          y: Math.round((position.y - 28 + offset) / 16) * 16,
                        });
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || !event.isPrimary || activeDrag.current) return;
                        const point = { x: event.clientX, y: event.clientY };
                        suppressClick.current = false;
                        activeDrag.current = {
                          pointerId: event.pointerId,
                          type,
                          origin: point,
                          point,
                          moved: false,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const current = activeDrag.current;
                        if (!current || current.pointerId !== event.pointerId) return;
                        const next = moveLibraryDrag(current, {
                          x: event.clientX,
                          y: event.clientY,
                        });
                        activeDrag.current = next;
                        if (next.moved) {
                          event.preventDefault();
                          setDragPreview(next);
                        }
                      }}
                      onPointerUp={(event) => {
                        const current = activeDrag.current;
                        if (!current || current.pointerId !== event.pointerId) return;
                        const final = moveLibraryDrag(current, {
                          x: event.clientX,
                          y: event.clientY,
                        });
                        activeDrag.current = null;
                        suppressClick.current = final.moved;
                        if (final.moved) {
                          event.preventDefault();
                          const canvas = document.querySelector(".canvas");
                          const bounds = canvas?.getBoundingClientRect();
                          const hit = document.elementFromPoint(event.clientX, event.clientY);
                          if (
                            canvas &&
                            bounds &&
                            canDropLibraryDevice(final, bounds) &&
                            hit?.closest(".canvas") === canvas
                          ) {
                            const point = screenToFlowPosition(final.point);
                            useTopologyStore.getState().addDevice(type, {
                              x: Math.round((point.x - 70) / 16) * 16,
                              y: Math.round((point.y - 28) / 16) * 16,
                            });
                          }
                        }
                        setDragPreview(null);
                        if (event.currentTarget.hasPointerCapture(event.pointerId))
                          event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                      onPointerCancel={(event) => {
                        if (activeDrag.current?.pointerId !== event.pointerId) return;
                        activeDrag.current = null;
                        suppressClick.current = true;
                        setDragPreview(null);
                      }}
                      onLostPointerCapture={(event) => {
                        if (activeDrag.current?.pointerId !== event.pointerId) return;
                        activeDrag.current = null;
                        suppressClick.current = true;
                        setDragPreview(null);
                      }}
                      onDragStart={(event) => event.preventDefault()}
                    >
                      <DeviceIcon type={type} className="device-icon" />
                      <span>{DEVICE_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 ? <p className="panel-empty">没有匹配的设备</p> : null}
      </div>
    </aside>
  );
}
