import { useState, useRef, useEffect } from "../../../../lib/teact/teact";
import useLastCallback from "../../../../hooks/useLastCallback";
import { ReactNode } from "react";

// Types remain the same
export type InputItem =
  | { type: 'character'; char: string; styles?: TextStyles }
  | { type: 'component'; element: React.ReactNode };

export interface TextStyles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

type InputEvent =
  | { type: 'insert_text'; text: string }
  | { type: 'insert_component'; element: React.ReactNode }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'delete_selection' }
  | { type: 'move_left' }
  | { type: 'move_right' }
  | { type: 'move_up' }
  | { type: 'move_down' }
  | { type: 'move_word_left' }
  | { type: 'move_word_right' }
  | { type: 'delete_word_left' }
  | { type: 'delete_word_right' }
  | { type: 'set_caret'; position: number };

export function useCustomInput() {
  const [items, setItems] = useState<InputItem[]>([]);
  const [caretPosition, setCaretPosition] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  const selectionAnchorRef = useRef<number | null>(null);
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection }, [selection]);

  const itemsRef = useRef(items);
  const caretRef = useRef(caretPosition);

  const eventQueueRef = useRef<InputEvent[]>([]);
  const isProcessingRef = useRef(false);

  const queueEvent = useLastCallback((event: InputEvent) => {
    eventQueueRef.current.push(event);
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      processEventQueue();
    }
  });

  const processEventQueue = useLastCallback(() => {
    if (eventQueueRef.current.length === 0) {
      isProcessingRef.current = false;
      return;
    }

    const event = eventQueueRef.current.shift()!;

    // if we have a selection and this is a typing/backspace/delete event, delete the range first
    if (
      selectionRef.current &&
      (event.type === 'insert_text' ||
        event.type === 'backspace' ||
        event.type === 'delete')
    ) {
      const { start, end } = selectionRef.current;
      const buf = [...itemsRef.current];
      buf.splice(start, end - start);
      itemsRef.current = buf;
      caretRef.current = start;
      selectionRef.current = null;
      setSelection(null);
      // flush state & continue
      setItems([...itemsRef.current]);
      setCaretPosition(caretRef.current);
      return processEventQueue();
    }

    switch (event.type) {
      case 'delete_selection': {
        if (selectionRef.current) {
          const { start, end } = selectionRef.current;
          const buf = [...itemsRef.current];
          buf.splice(start, end - start);
          itemsRef.current = buf;
          caretRef.current = start;
          selectionRef.current = null;
          setSelection(null);
        }
        break;
      }
      case 'insert_text': {
        const chars = Array.from(event.text).map(char => ({ type: 'character' as const, char }));
        const at = caretRef.current;
        const buf = [...itemsRef.current];
        buf.splice(at, 0, ...chars);
        itemsRef.current = buf;
        caretRef.current = at + chars.length;
        break;
      }
      case 'insert_component': {
        const at = caretRef.current;
        const buf = [...itemsRef.current];
        buf.splice(at, 0, { type: 'component' as const,  element: event.element });
        itemsRef.current = buf;
        caretRef.current = at + 1;
        break;
      }
      case 'backspace': {
        if (caretRef.current > 0) {
          const buf = [...itemsRef.current];
          buf.splice(caretRef.current - 1, 1);
          itemsRef.current = buf;
          caretRef.current--;
        }
        break;
      }
      case 'delete': {
        if (caretRef.current < itemsRef.current.length) {
          const buf = [...itemsRef.current];
          buf.splice(caretRef.current, 1);
          itemsRef.current = buf;
        }
        break;
      }
      case 'move_left': {
        caretRef.current = Math.max(0, caretRef.current - 1);
        break;
      }
      case 'move_right': {
        caretRef.current = Math.min(itemsRef.current.length, caretRef.current + 1);
        break;
      }
      case 'move_word_left': {
        caretRef.current = findWordBoundary(itemsRef.current, caretRef.current, -1);
        break;
      }
      case 'move_word_right': {
        caretRef.current = findWordBoundary(itemsRef.current, caretRef.current, 1);
        break;
      }
      case 'set_caret': {
        caretRef.current = Math.max(0, Math.min(event.position, itemsRef.current.length));
        break;
      }
      case 'delete_word_left': {
        const newPos = findWordBoundary(itemsRef.current, caretRef.current, -1);
        itemsRef.current.splice(newPos, caretRef.current - newPos);
        caretRef.current = newPos;
        break;
      }
      case 'delete_word_right': {
        const newPos = findWordBoundary(itemsRef.current, caretRef.current, 1);
        itemsRef.current.splice(caretRef.current, newPos - caretRef.current);
        break;
      }
    }

    setItems([...itemsRef.current]);
    setCaretPosition(caretRef.current);

    if (eventQueueRef.current.length > 0) {
      processEventQueue();
    } else {
      isProcessingRef.current = false;
    }
  });

  // selection helpers
  const clearSelection = useLastCallback(() => {
    selectionAnchorRef.current = null;
    setSelection(null);
  });

  const selectAll = useLastCallback(() => {
    const len = itemsRef.current.length;
    selectionAnchorRef.current = 0;
    setSelection({ start: 0, end: len });
    setItems([...itemsRef.current]);
    setCaretPosition(len);
  });

  const extendSelectionLeft = useLastCallback(() => {
    if (selectionAnchorRef.current === null) {
      selectionAnchorRef.current = caretRef.current;
    }
    caretRef.current = Math.max(0, caretRef.current - 1);
    const start = Math.min(selectionAnchorRef.current!, caretRef.current);
    const end = Math.max(selectionAnchorRef.current!, caretRef.current);
    setSelection({ start, end });
    setItems([...itemsRef.current]);
    setCaretPosition(caretRef.current);
  });

  const extendSelectionRight = useLastCallback(() => {
    if (selectionAnchorRef.current === null) {
      selectionAnchorRef.current = caretRef.current;
    }
    caretRef.current = Math.min(itemsRef.current.length, caretRef.current + 1);
    const start = Math.min(selectionAnchorRef.current!, caretRef.current);
    const end = Math.max(selectionAnchorRef.current!, caretRef.current);
    setSelection({ start, end });
    setItems([...itemsRef.current]);
    setCaretPosition(caretRef.current);
  });

  // collapse start+update into one
  const updateMouseSelection = useLastCallback((pos: number) => {
    // first call: anchor yourself here
    if (selectionAnchorRef.current === null) {
      selectionAnchorRef.current = pos;
    }
    // move caret and compute new range
    caretRef.current = pos;

    const start = Math.min(selectionAnchorRef.current!, pos);
    const end   = Math.max(selectionAnchorRef.current!, pos);

    setSelection({ start, end });
    setItems([...itemsRef.current]);
    setCaretPosition(pos);
  });


  const findVerticalPosition = useLastCallback((direction: -1 | 1): number => {
    const caretEl = document.querySelector<HTMLElement>('.caret');
    if (!caretEl) return caretRef.current;

    const cont = caretEl.parentElement!;
    const contStyle = getComputedStyle(cont);
    const lineHeight = parseFloat(contStyle.lineHeight) || caretEl.getBoundingClientRect().height;

    const { left, top } = caretEl.getBoundingClientRect();
    const x = left + 1;
    const y = direction < 0
      ? top - 1
      : top + lineHeight + 1;

    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(x, y);
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
    if (!range) return caretRef.current;

    let node: Node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode!;
    if (node instanceof HTMLElement && node.dataset.index != null) {
      const idx = Number(node.dataset.index);
      return range.startOffset > ((node.textContent || '').length / 2)
        ? idx + 1
        : idx;
    }
    return caretRef.current;
  });

  return {
    items,
    caretPosition,
    selection,
    insertTextAtCaret: useLastCallback((t: string) => queueEvent({ type: 'insert_text', text: t })),
    insertComponentAtCaret: useLastCallback((element: React.ReactNode) => queueEvent({ type: 'insert_component', element })),
    handleBackspace: useLastCallback(() => queueEvent({ type: 'backspace' })),
    handleDelete: useLastCallback(() => queueEvent({ type: 'delete' })),
    handleDeleteSelection: useLastCallback(() => queueEvent({ type: 'delete_selection' })),
    moveCaretLeft: useLastCallback(() => queueEvent({ type: 'move_left' })),
    moveCaretRight: useLastCallback(() => queueEvent({ type: 'move_right' })),
    moveWordLeft: useLastCallback(() => queueEvent({ type: 'move_word_left' })),    // ←
    moveWordRight: useLastCallback(() => queueEvent({ type: 'move_word_right' })),  // →
    moveCaretUp: useLastCallback(() => queueEvent({ type: 'move_up' })),
    moveCaretDown: useLastCallback(() => queueEvent({ type: 'move_down' })),
    setCaretToPosition: useLastCallback((pos: number) => queueEvent({ type: 'set_caret', position: pos })),
    clearSelection,
    selectAll,
    extendSelectionLeft,
    extendSelectionRight,
    updateMouseSelection,            // now signature (pos, isStart?)
    getPlainText: useLastCallback(() =>
      itemsRef.current.map(i => (i.type === 'character' ? i.char : '')).join('')
    ),
    findVerticalPosition,
    deleteWordLeft: useLastCallback(() => queueEvent({ type: 'delete_word_left' })),
    deleteWordRight: useLastCallback(() => queueEvent({ type: 'delete_word_right' })),
  };
}

export default useCustomInput;

// helper to find next word boundary left or right
function findWordBoundary(
  items: InputItem[],
  pos: number,
  direction: -1 | 1,
): number {
  let p = pos;
  if (direction < 0) {
    // skip spaces to the left
    while (p > 0 && items[p - 1].type === 'character' && /\s/.test((items[p - 1] as { type: 'character'; char: string }).char)) {
      p--;
    }
    // skip word to the left
    while (p > 0 && items[p - 1].type === 'character' && !/\s/.test((items[p - 1] as { type: 'character'; char: string }).char)) {
      p--;
    }
  } else {
    const len = items.length;
    // skip spaces to the right
    while (p < len && items[p].type === 'character' && /\s/.test((items[p] as { type: 'character'; char: string }).char)) {
      p++;
    }
    // skip word to the right
    while (p < len && items[p].type === 'character' && !/\s/.test((items[p] as { type: 'character'; char: string }).char)) {
      p++;
    }
  }
  return p;
}