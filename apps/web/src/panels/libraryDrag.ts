import type { DeviceType } from "../engine";

export interface LibraryDrag {
  pointerId: number;
  type: DeviceType;
  origin: { x: number; y: number };
  point: { x: number; y: number };
  moved: boolean;
}

export function moveLibraryDrag(drag: LibraryDrag, point: LibraryDrag["point"]): LibraryDrag {
  return {
    ...drag,
    point,
    moved: drag.moved || Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) >= 6,
  };
}

export function canDropLibraryDevice(
  drag: LibraryDrag,
  bounds: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    drag.moved &&
    drag.point.x >= bounds.left &&
    drag.point.x < bounds.right &&
    drag.point.y >= bounds.top &&
    drag.point.y < bounds.bottom
  );
}
