import { useEffect, useRef, useSignal } from "../../../lib/teact/teact";
import { debounce } from "../../../util/schedulers";

const HTML_INPUT_HISTORY_DEBOUNCE_MS = 300;
const HTML_INPUT_HISTORY_MAX_TOTAL_LENGTH = 4096 * 50; // ~200KB

function pruneHistory(history: string[], maxTotalLength: number): string[] {
  for (let i = 0; i < history.length - 1; i++) {
    const totalLength = history.slice(i).join('').length;
    if (totalLength < maxTotalLength) {
      return history.slice(i);
    }
  }
  return history.slice(-1);
}

export default function useHtmlInput(initialValue: string = '') {  
  const mounted = useRef(false);
  useEffect(() => {
      mounted.current = true;
      resetHtml();
      return () => mounted.current = false;
  }, []);

  // Simple signal for the current HTML input value
  const [getHtml, __setHtml] = useSignal(initialValue);

  // Array of HTML input values to keep track of the history
  const inputSnapshotListRef = useRef<string[]>([]);
  const currentSnapshotIndexRef = useRef<number>(null);

  const debouncedPush = debounce((html: string) => {
    if (
      !mounted.current ||
      inputSnapshotListRef.current.length &&
      inputSnapshotListRef.current[inputSnapshotListRef.current.length - 1] === html
    ) return;

    inputSnapshotListRef.current.push(html);
    for (let i = 0; i < inputSnapshotListRef.current.length - 1; i++) {
      const totalLength = inputSnapshotListRef.current.slice(i).join('').length;
      if (totalLength < HTML_INPUT_HISTORY_MAX_TOTAL_LENGTH) {
        inputSnapshotListRef.current = inputSnapshotListRef.current.slice(i);
        break;
      }
    }
    console.warn(inputSnapshotListRef.current);
    currentSnapshotIndexRef.current = inputSnapshotListRef.current.length - 1;
  }, HTML_INPUT_HISTORY_DEBOUNCE_MS, false);

  const setHtml = (html: string) => {
    const index = currentSnapshotIndexRef.current;
    if (index !== null && index !== inputSnapshotListRef.current.length - 1) {
      inputSnapshotListRef.current = inputSnapshotListRef.current.slice(0, index + 1);
    }

    __setHtml(html);
    debouncedPush(html);
  }
  
  /** @returns isLastAction */
  const undoHtml = (): boolean => {
    const index = currentSnapshotIndexRef.current;
    if (index === null || index === 0) {
      return true;
    }

    currentSnapshotIndexRef.current = index - 1;
    __setHtml(inputSnapshotListRef.current[index - 1]);
    return false;
  }

  /** @returns isLastAction */
  const redoHtml = (): boolean => {
    const index = currentSnapshotIndexRef.current;
    if (index === null || index === inputSnapshotListRef.current.length - 1) {
      return true;
    }

    currentSnapshotIndexRef.current = index + 1;
    __setHtml(inputSnapshotListRef.current[index + 1]);
    return false;
  }

  const resetHtml = () => {
    inputSnapshotListRef.current = [initialValue];
    currentSnapshotIndexRef.current = 0;
  }

  return { getHtml, setHtml, undoHtml, redoHtml, resetHtml };
}