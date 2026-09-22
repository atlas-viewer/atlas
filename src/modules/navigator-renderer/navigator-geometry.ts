export type NavigatorWorldRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NavigatorTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  worldX: number;
  worldY: number;
  worldWidth: number;
  worldHeight: number;
};

export function getNavigatorWorldTransform(
  worldWidth: number,
  worldHeight: number,
  navigatorWidth: number,
  navigatorHeight: number,
  worldX = 0,
  worldY = 0
): NavigatorTransform {
  const safeWorldWidth = Math.max(1, worldWidth);
  const safeWorldHeight = Math.max(1, worldHeight);
  const scale = Math.min(navigatorWidth / safeWorldWidth, navigatorHeight / safeWorldHeight);

  return {
    scale,
    offsetX: (navigatorWidth - safeWorldWidth * scale) / 2,
    offsetY: (navigatorHeight - safeWorldHeight * scale) / 2,
    worldX,
    worldY,
    worldWidth: safeWorldWidth,
    worldHeight: safeWorldHeight,
  };
}

export function navigatorToWorldPoint(transform: NavigatorTransform, x: number, y: number): { x: number; y: number } {
  if (!transform.scale || !Number.isFinite(transform.scale)) {
    return { x: transform.worldX, y: transform.worldY };
  }

  const worldX = transform.worldX + (x - transform.offsetX) / transform.scale;
  const worldY = transform.worldY + (y - transform.offsetY) / transform.scale;

  return {
    x: Math.max(transform.worldX, Math.min(transform.worldX + transform.worldWidth, worldX)),
    y: Math.max(transform.worldY, Math.min(transform.worldY + transform.worldHeight, worldY)),
  };
}

export function rotatedNavigatorToWorldPoint(
  transform: NavigatorTransform,
  x: number,
  y: number,
  rotation: number
): { x: number; y: number } {
  if (!transform.scale || !Number.isFinite(transform.scale)) {
    return { x: transform.worldX, y: transform.worldY };
  }
  const centerX = transform.offsetX + (transform.worldWidth * transform.scale) / 2;
  const centerY = transform.offsetY + (transform.worldHeight * transform.scale) / 2;
  const angle = (-rotation * Math.PI) / 180;
  const dx = x - centerX;
  const dy = y - centerY;
  const unrotatedX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
  const unrotatedY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);
  return {
    x: transform.worldX + (unrotatedX - transform.offsetX) / transform.scale,
    y: transform.worldY + (unrotatedY - transform.offsetY) / transform.scale,
  };
}
