import {
  Archive, Backpack, Box, Boxes, Brush, Container, Cylinder, Droplets, Flame, Frame, Grid3x3, Hexagon,
  Layers, Package, Puzzle, Square, Wrench, type LucideIcon,
} from 'lucide-react';

/** Catálogo integrado: el servidor guarda solo el nombre. Los iconos propios de piezas llegan en una fase posterior. */
const ICONS: Record<string, LucideIcon> = {
  hive: Boxes, component: Puzzle, nucleus: Hexagon, frame: Frame, tool: Wrench, accessory: Backpack,
  feed: Droplets, extractor: Cylinder, more: Package,
  floor: Square, brood: Box, super: Layers, 'inner-cover': Archive, lid: Square,
  excluder: Grid3x3, grid: Grid3x3, smoker: Flame, 'hive-tool': Wrench, brush: Brush, uncapper: Container, tank: Container,
};

export function iconFor(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Package;
}

export const ICON_NAMES = Object.keys(ICONS);
