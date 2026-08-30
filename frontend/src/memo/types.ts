import type { ObjectLinkSide } from "../shared/primitives";

export interface MemoTextSection {
  id: string;
  type: "text";
  content: string;
}

export interface MemoTableSection {
  id: string;
  type: "table";
  cells: string[][];
}

export type MemoSection = MemoTextSection | MemoTableSection;

export interface MemoLink {
  id: string;
  memoId: string;
  targetObjectId: string;
}

export interface MemoObject {
  kind: "memo";
  id: string;
  title: string;
  sections: MemoSection[];
  links: MemoLink[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  objectLinkSide?: ObjectLinkSide;
}
