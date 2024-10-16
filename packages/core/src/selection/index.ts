import type { Editor } from "../editor";
import { EDITOR_EVENT } from "../event/bus/types";
import { isArrowLeft, isArrowRight } from "../input/utils/hot-key";
import { EDITOR_STATE } from "../state/types";
import { Point } from "./modules/point";
import { Range } from "./modules/range";
import { RawRange } from "./modules/raw-range";
import { getRootSelection, getStaticSelection } from "./utils/dom";
import { isBackward } from "./utils/dom";
import { toModelRange } from "./utils/model";
import { isEqualDOMRange, toDOMRange } from "./utils/native";

export class Selection {
  private previous: Range | null = null;
  private current: Range | null = null;

  constructor(private editor: Editor) {
    this.editor.event.on(EDITOR_EVENT.SELECTION_CHANGE_NATIVE, this.onNativeSelectionChange);
    this.editor.event.on(EDITOR_EVENT.KEY_DOWN, this.onArrowKeyDown);
  }

  public destroy() {
    this.editor.event.off(EDITOR_EVENT.SELECTION_CHANGE_NATIVE, this.onNativeSelectionChange);
    this.editor.event.off(EDITOR_EVENT.KEY_DOWN, this.onArrowKeyDown);
  }

  /**
   * 获取当前选区
   */
  public get(): Range | null {
    return this.current;
  }

  /**
   * 获取 RawRangeModel 选区表达
   */
  public toRaw() {
    return RawRange.fromRange(this.editor, this.current);
  }

  /**
   * 处理选区变换事件
   */
  private onNativeSelectionChange = () => {
    const root = this.editor.getContainer();
    const sel = getRootSelection(root);
    const staticSel = getStaticSelection(sel);
    if (!sel || !staticSel || this.editor.state.get(EDITOR_STATE.COMPOSING)) {
      return void 0;
    }
    // 选区必然是从 startContainer 到 endContainer
    const { startContainer, endContainer, collapsed } = staticSel;
    if (!root.contains(startContainer)) {
      return void 0;
    }
    if (!collapsed && !root.contains(endContainer)) {
      return void 0;
    }
    const backward = isBackward(sel, staticSel);
    const range = toModelRange(this.editor, staticSel, backward);
    this.set(range, true);
  };

  /**
   * 更新选区模型
   */
  public set(range: Range | null, force = false): void {
    if (Range.isEqual(this.current, range)) {
      this.current = range;
      return void 0;
    }
    this.previous = this.current;
    this.current = range;
    this.editor.logger.debug("Selection Change", range);
    this.editor.event.trigger(EDITOR_EVENT.SELECTION_CHANGE, {
      previous: this.previous,
      current: this.current,
    });
    if (force) {
      this.updateDOMSelection();
    }
  }

  /**
   * 更新浏览器选区
   */
  public updateDOMSelection() {
    const range = this.current;
    if (!range || this.editor.state.get(EDITOR_STATE.COMPOSING)) {
      return false;
    }
    const root = this.editor.getContainer();
    const selection = getRootSelection(root);
    if (!selection) {
      return false;
    }
    const sel = toDOMRange(this.editor, range);
    if (!sel || !sel.startContainer || !sel.endContainer) {
      this.editor.logger.warning("Invalid DOM Range", sel);
      selection.removeAllRanges();
      return false;
    }
    const currentStaticSel = getStaticSelection(selection);
    if (isEqualDOMRange(sel, currentStaticSel)) {
      return true;
    }
    const { startContainer, startOffset, endContainer, endOffset } = sel;
    // FIX: 这里的 Backward 以 Range 状态为准
    if (range.isBackward) {
      selection.setBaseAndExtent(endContainer, endOffset, startContainer, startOffset);
    } else {
      selection.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset);
    }
    return true;
  }

  /**
   * 处理方向键选区事件
   * @param event
   */
  private onArrowKeyDown = (event: KeyboardEvent) => {
    const leftArrow = isArrowLeft(event);
    const rightArrow = isArrowRight(event);
    if (!(leftArrow || rightArrow) || event.metaKey || event.altKey) {
      return void 0;
    }
    const range = this.get();
    if (!range || !this.editor.state.isFocused() || this.editor.state.isComposing()) {
      return void 0;
    }
    const focus = range.isBackward ? range.start : range.end;
    const anchor = range.isBackward ? range.end : range.start;
    const blockState = this.editor.state.block;
    const lineState = blockState && blockState.getLine(focus.line);
    if (!blockState || !lineState) return void 0;
    const isFirstLine = focus.line === 0;
    const isLastLine = focus.line === blockState.getLines().length - 1;
    const isFocusLineStart = focus.offset === 0;
    // 选区会强制变换到末尾节点前
    const isFocusLineEnd = focus.offset === lineState.size - 1;
    if (leftArrow) {
      // 在块的首行首节点按左键执行默认行为
      if (isFirstLine && isFocusLineStart) return void 0;
      // 在非首行的首节点时将选取设置为前一行的末尾
      if (isFocusLineStart) {
        const prevLine = blockState.getLine(focus.line - 1);
        if (!prevLine) return void 0;
        event.preventDefault();
        // COMPAT: 选区正向 则只会影响到 end 节点, 选区反向 则只会影响到 start 节点
        // 而 Range => start -> end, 只需要判断 isBackward 标识
        // start -> end 实际方向会在 new Range 时处理, 无需在此处实现
        const newFocus = new Point(prevLine.index, prevLine.size - 1);
        // 边界条件 选区折叠时 shift + left 一定是反选, 否则取原始选区方向
        const isBackward = event.shiftKey && range.isCollapsed ? true : range.isBackward;
        const newAnchor = event.shiftKey ? anchor : newFocus.clone();
        this.set(new Range(newAnchor, newFocus, isBackward), true);
      }
    }
    if (rightArrow) {
      // 在块的末行末节点按右键执行默认行为
      if (isLastLine && isFocusLineEnd) return void 0;
      // 在非末行的末节点时将选取设置为后一行的首节点
      if (isFocusLineEnd) {
        const nextLine = blockState.getLine(focus.line + 1);
        if (!nextLine) return void 0;
        event.preventDefault();
        const newFocus = new Point(nextLine.index, 0);
        // 边界条件 选区折叠时 shift + right 一定是正选, 否则取原始选区方向
        // [focus]\n[anchor] 此时按 right, 会被认为是 反选+折叠, 实际状态会被 new Range 校正
        const isBackward = event.shiftKey && range.isCollapsed ? false : range.isBackward;
        const newAnchor = event.shiftKey ? anchor : newFocus.clone();
        this.set(new Range(newAnchor, newFocus, isBackward), true);
      }
    }
  };
}
