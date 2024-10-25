import type { Delta } from "block-kit-delta";

import type { RawRange } from "../../selection/modules/raw-range";

export type StackItem = {
  delta: Delta;
  range: RawRange | null;
};

export type Stack = {
  undo: StackItem[];
  redo: StackItem[];
};