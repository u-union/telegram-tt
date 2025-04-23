import { RefObject, useCallback, useEffect, useRef, useSignal } from "../../../lib/teact/teact";
import { debounce } from "../../../util/schedulers";
import { getCaretPosition, setCaretPosition } from "../../../util/selection";

type HtmlInputHistory = {
  caretPosition: number;
  html: string;
}

const HTML_INPUT_HISTORY_DEBOUNCE_MS = 400;
const HTML_INPUT_HISTORY_MAX_TOTAL_LENGTH = 4096 * 100; // ~400KB

function pruneHistory(history: HtmlInputHistory[], maxTotalLength: number): HtmlInputHistory[] {
  for (let i = 0; i < history.length - 1; i++) {
    const totalLength = history.slice(i).map(h => h.html).join('').length;
    if (totalLength < maxTotalLength) {
      return history.slice(i);
    }
  }
  return history.slice(-1);
}

const observeInnerHtmlChangeOnce = (
  element: HTMLElement,
  callback: () => void
) => {
  const observer = new MutationObserver(() => {
    observer.disconnect();
    callback();
  });
  observer.observe(element, { childList: true, subtree: true, characterData: true });
}  

export default function useHtmlInput(inputRef: RefObject<HTMLDivElement | null>, chatId: string) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    resetHtml();
    return () => mounted.current = false;
  }, []);

  // Simple signal for the current HTML input value
  const [getHtml, __setHtml] = useSignal('');

  // Array of HTML input values to keep track of the history
  const inputSnapshotListRef = useRef<HtmlInputHistory[]>([]);
  const currentSnapshotIndexRef = useRef<number>(null);

  // Save input snapshot with debounce to saving on every keystroke
  const debouncedPush = useCallback(
    debounce((html: string) => {
      if (
        !inputRef.current ||
        !mounted.current ||
        inputSnapshotListRef.current.length &&
        inputSnapshotListRef.current[inputSnapshotListRef.current.length - 1].html === html
      ) return;

      const htmlInputHistoryItem: HtmlInputHistory = {
        caretPosition: getCaretPosition(inputRef.current),
        html,
      };
      inputSnapshotListRef.current.push(htmlInputHistoryItem);
      inputSnapshotListRef.current = pruneHistory(inputSnapshotListRef.current, HTML_INPUT_HISTORY_MAX_TOTAL_LENGTH);
      currentSnapshotIndexRef.current = inputSnapshotListRef.current.length - 1;
    }, HTML_INPUT_HISTORY_DEBOUNCE_MS, false),
    [chatId, mounted]
  )

  // Function to handle incoming HTML input
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
    const prevHtmlInputHistoryItem = inputSnapshotListRef.current[index - 1];

    __setHtml(prevHtmlInputHistoryItem.html);

    // Restore the caret position when the input is changed
    if (inputRef.current) {
      observeInnerHtmlChangeOnce(inputRef.current, () => {
        inputRef.current && setCaretPosition(inputRef.current, prevHtmlInputHistoryItem.caretPosition);
      });
    }
    return false;
  }

  /** @returns isLastAction */
  const redoHtml = (): boolean => {
    const index = currentSnapshotIndexRef.current;
    if (index === null || index === inputSnapshotListRef.current.length - 1) {
      return true;
    }

    currentSnapshotIndexRef.current = index + 1;
    const nextHtmlInputHistoryItem = inputSnapshotListRef.current[index + 1];
    __setHtml(nextHtmlInputHistoryItem.html);

    // Restore the caret position when the input is changed
    if (inputRef.current) {
      observeInnerHtmlChangeOnce(inputRef.current, () => {
        inputRef.current && setCaretPosition(inputRef.current, nextHtmlInputHistoryItem.caretPosition);
      });
    }
    return false;
  }

  const resetHtml = () => {
    inputSnapshotListRef.current = [];
    currentSnapshotIndexRef.current = 0;
  }

  /**
   * Feature(kind of): force to save a snapshot of input on delimiters
   * Should provide a better experience for the user
   */
  const isDelimiterKeyPressed: RefObject<boolean> = useRef(false);
  const delimiterKeys = ['Enter', 'Tab', ' ', ',', ';', '.', '!', '?', ':', '\n'];
  // Listen if any of separating symbols are pressed
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (delimiterKeys.includes(event.key)) {
        if (!isDelimiterKeyPressed.current) {
          isDelimiterKeyPressed.current = true;
          // Flush debounced push to save the current input
          debouncedPush.flush();
        }
      } else {
        // Reset the flag if any other key is pressed
        isDelimiterKeyPressed.current = false;
      }
    };

    const inputElement = inputRef?.current;
    if (inputElement) {
      inputElement.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (inputElement) {
        inputElement.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [chatId, debouncedPush]);

  return { getHtml, setHtml, undoHtml, redoHtml, resetHtml };
}
