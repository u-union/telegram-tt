/**
 * This component is an approach to implement 'command-like' input history saving
 * Curently - it's able to work with adding/removing (single and multiple) text and undo/redo without issues
 * It uses Selection/Caret Position to locate the text that was changed which is kind of bottleneck now
 * As when typing fast enough (multiple keys at same time) - selection postions is not being updated as fast as the input
 * Also formatting text changes should be handled by SLP approach used in @file TextFormatter.tsx 
 * 
 * With all being said - I tried it as kind of PoC and for now I do not see a point of further polishing this code
 * As well as, do not really know if it's worth to implement it in the first place. Besides, it can save a lot of memory
 * when huge texts are being edited - Telegram is not a text editor after all, and maybe it just too much for a chat app message input
 */

import React, { useEffect, useRef, useState } from "../../../lib/teact/teact";
import { INPUT_HISTORY_IDB_STORE } from "../../../util/browser/idb";
import { getAbsoluteRangeOffsets, getCaretPosition } from "../../../util/selection";
import { Signal } from "../../../util/signals";
import useLastCallback from "../../../hooks/useLastCallback";

type SelectionPosition = {
  start: number;
  end: number;
}

type InputHistoryItem = {
  id: number;
  actions: InputHistoryItemAction[];
}

type InputHistoryItemAction = {
  prev: string;
  next: string;
  position: number;
}

const useHtmlInputHistory = (
  chatId: string,
  getHtml: Signal<string>,
  setHtml: (html: string) => void,
  inputRef: React.RefObject<HTMLElement>,
  maxHistoryLength: number = 10,
) => {
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition>({ start: 0, end: 0 });
  const [prevInputDEBUG, setPrevInputDEBUG] = useState<string>('');

  const [history, setHistory] = useState<InputHistoryItem[]>([]);
  const [currentItemId, setCurrentItemId] = useState<number>(0);

  /**
   * On ChatId change, resets the input history
   * If no chatId, initialize history for chatId with empty string
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await INPUT_HISTORY_IDB_STORE.get<InputHistoryItem[]>(chatId) || [];
      if (cancelled) return;
      setHistory(loaded);
      setCurrentItemId(loaded.length - 1);
    })();
    return () => { cancelled = true };
  }, [chatId]);

  /**
   * Persist the input history to IndexedDB
   * @param newHist - The new history to persist
   */
  const persist = useLastCallback(async (newHist: InputHistoryItem[]) => {
    await INPUT_HISTORY_IDB_STORE.set(chatId, newHist);
  });

  /**
   * Add a new item to the input history
   * @param action The action to add to the history
   */
  const push = useLastCallback((action: InputHistoryItemAction) => {
    const nextId = history.length;
    const newItem: InputHistoryItem = { id: nextId, actions: [action] };
    const newHist = [...history, newItem];

    setHistory(newHist);
    setCurrentItemId(newHist.length - 1);
    persist(newHist);
  });

  const undo = useLastCallback(() => {
    if (currentItemId < 0) return false;
    const item = history[currentItemId];
    let txt = getHtml();
    for (let i = item.actions.length - 1; i >= 0; i--) {
      const a = item.actions[i];
      txt = txt.slice(0, a.position) + a.prev + txt.slice(a.position + a.next.length);
    }
    setHtml(txt);
    setCurrentItemId(c => c - 1);
    return true;
  });

  const redo = useLastCallback(() => {
    if (currentItemId + 1 >= history.length) return false;
    const item = history[currentItemId + 1];
    let txt = getHtml();
    for (const a of item.actions) {
      txt = txt.slice(0, a.position) + a.next + txt.slice(a.position + a.prev.length);
    }
    setHtml(txt);
    setCurrentItemId(c => c + 1);
    return true;
  });

  /**
   * Input handle (queue + processing)
   */
  type InputChangeQueueItem = {
    inputValue: string;
    selectionPosition: SelectionPosition;
    caretPosition: number;
  }
  const htmlChangeQueue = useRef<InputChangeQueueItem[]>([]);
  const isProcessingHtml = useRef(false);

  // Queue the input change and process it one by one
  const onHtmlChange = useLastCallback((inputValue: string) => {
    if (!inputRef.current) return;
    const newChangeItem: InputChangeQueueItem = {
      inputValue,
      selectionPosition,
      caretPosition: getCaretPosition(inputRef.current),
    }
    htmlChangeQueue.current.push(newChangeItem);
    console.warn('onHtmlChange, queue size:', htmlChangeQueue.current.length);
    if (isProcessingHtml.current) return;
    isProcessingHtml.current = true;

    const processQueue = async () => {
      while (htmlChangeQueue.current.length > 0) {
        const value = htmlChangeQueue.current.shift();
        if (value) {
          processInputChange(value);
          console.warn('Processed input change:', value);
        }
      }
      isProcessingHtml.current = false;
    }

    processQueue();
  });

  // Process new input and generate change action
  const processInputChange = useLastCallback((e: InputChangeQueueItem) => {
    const { inputValue, selectionPosition, caretPosition } = e;
    const isSameInput = prevInputDEBUG === inputValue;
    if (isSameInput) {
      console.warn('Same input, skipping history update');
      return;
    }

    if (caretPosition < selectionPosition.start) {
      const prevBeforeSelection = prevInputDEBUG.slice(0, caretPosition);
      const prevSelection = prevInputDEBUG.slice(caretPosition, selectionPosition.start);
      const prevAfterSelection = prevInputDEBUG.slice(selectionPosition.start);

      const currentBeforeSelection = inputValue.slice(0, caretPosition);
      const currentSelection = inputValue.slice(caretPosition, selectionPosition.start);
      const currentAfterSelection = inputValue.slice(selectionPosition.start);

      if (
        prevBeforeSelection === currentBeforeSelection &&
        prevAfterSelection === currentAfterSelection
      ) {
        push({
          prev: prevSelection,
          next: currentSelection,
          position: caretPosition,
        })
        setPrevInputDEBUG(inputValue);
        return;
      } else {
        console.error('Different before and after selection, saving full input change');
        console.error('Before: ', prevBeforeSelection, prevSelection, prevAfterSelection);
        console.error('Current: ', currentBeforeSelection, currentSelection, currentAfterSelection);
      }
    } else {
      const prevBeforeSelection = prevInputDEBUG.slice(0, selectionPosition.start);
      const prevSelection = prevInputDEBUG.slice(selectionPosition.start, selectionPosition.end);
      const prevAfterSelection = prevInputDEBUG.slice(selectionPosition.end);

      const currentBeforeSelection = inputValue.slice(0, selectionPosition.start);
      const currentSelection = inputValue.slice(selectionPosition.start, caretPosition);
      const currentAfterSelection = inputValue.slice(caretPosition);

      if (
        prevBeforeSelection === currentBeforeSelection &&
        prevAfterSelection === currentAfterSelection
      ) {
        push({
          prev: prevSelection,
          next: currentSelection,
          position: selectionPosition.start,
        })
        setPrevInputDEBUG(inputValue);

        return;
      } else {
        console.error('Different before and after selection, saving full input change');
        console.error('Before: ', prevBeforeSelection, prevSelection, prevAfterSelection);
        console.error('Current: ', currentBeforeSelection, currentSelection, currentAfterSelection);
      }
    }

    // here if nothing worked
    // just change the whole input
    push({
      prev: prevInputDEBUG,
      next: inputValue,
      position: 0,
    })
    setPrevInputDEBUG(inputValue);
    return;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey, shiftKey } = event;
      // Handle Ctrl/Cmd + Z/Y for undo/redo
      if ((ctrlKey || metaKey) && (key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) {
        event.preventDefault();
        // Redo (Ctrl/Cmd+Y) or (Ctrl/Cmd+Shift+Z)
        if (key.toLowerCase() === 'y' || (shiftKey && key.toLowerCase() === 'z')) {
          redo()
          // if (onInputHtmlRedo?.()) {
          //   shakeElement(getHtmlInputText() ? inputRef?.current : inputBoxPlaceholderRef?.current);
          // }
        }
        // Undo (Ctrl/Cmd+Z)
        else if (key.toLowerCase() === 'z') {
          undo()
          // if (undoHtml()) {
          //   shakeElement(getHtmlInputText() ? inputRef?.current : inputBoxPlaceholderRef?.current); id
          // }
        }
        return;
      }
    }

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (inputElement) {
        inputElement.removeEventListener('keydown', handleKeyDown);
      }
    }
  }, [chatId, currentItemId]);


  /**
   * Listen for selection changes and update the selection position
   */
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const container = sel.getRangeAt(0).startContainer;
      if (!inputRef.current?.contains(container)) return;

      const range = sel.getRangeAt(0);
      const { start, end } = getAbsoluteRangeOffsets(range, inputRef.current.id);
      setSelectionPosition({ start, end: end + 1 });
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [chatId]);

  return {
    onHtmlChange
  }
};

export default useHtmlInputHistory;