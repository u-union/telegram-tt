import React, { FC, useRef, useEffect } from "../../../lib/teact/teact";
import useLastCallback from "../../../hooks/useLastCallback";
import useCustomInput, { InputItem, TextStyles } from "./hooks/useCustomInput";

import './CustomInput.scss';
import useAppLayout from "../../../hooks/useAppLayout";
import { IS_ANDROID, IS_IOS } from "../../../util/windowEnvironment";
import buildClassName from "../../../util/buildClassName";

type OwnProps = {
  className?: string;
  placeholder?: string;
  messageSendKeyCombo?: string;
  onChange?: (text: string) => void;
}

const CustomInput: FC<OwnProps> = ({
  className,
  messageSendKeyCombo,
  placeholder,
  onChange
}) => {
  const {
    items,
    caretPosition,
    selection,
    clearSelection,
    selectAll,
    updateMouseSelection,
    extendSelectionLeft,
    extendSelectionRight,
    insertTextAtCaret,
    insertComponentAtCaret,
    handleBackspace,
    handleDelete,
    handleDeleteSelection,
    moveCaretLeft,
    moveCaretRight,
    moveWordLeft,
    moveWordRight,
    moveCaretUp,
    moveCaretDown,
    setCaretToPosition,
    findVerticalPosition,
    getPlainText,
    deleteWordLeft,
    deleteWordRight,
  } = useCustomInput();

  const contentRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // On items change, gener ate html and send to OnChange
  useEffect(() => {
    const text = getPlainText();
    if (onChange) {
      onChange(text);
    }
  }, [items, getPlainText, onChange]);

  // Check if the device is mobile
  const { isMobile } = useAppLayout();
  const isMobileDevice = !!isMobile && (IS_IOS || IS_ANDROID);
  
  const handleKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { key, ctrlKey, metaKey, shiftKey, altKey } = e;

    // Ctrl+←: слово влево
    if ((ctrlKey || metaKey) && key === 'ArrowLeft' && !shiftKey) {
      e.preventDefault();
      clearSelection();
      return moveWordLeft();
    }
    // Ctrl+→: слово вправо
    if ((ctrlKey || metaKey) && key === 'ArrowRight' && !shiftKey) {
      e.preventDefault();
      clearSelection();
      return moveWordRight();
    }

    if ((ctrlKey || metaKey) && !shiftKey && key === 'Backspace') {
      e.preventDefault();
      clearSelection();
      return deleteWordLeft();
    }
    if ((ctrlKey || metaKey) && !shiftKey && key === 'Delete') {
      e.preventDefault();
      clearSelection();
      return deleteWordRight();
    }

    // Ctrl + A or Cmd + A to select all text.
    if ((ctrlKey || metaKey) && key.toLowerCase() === 'a') {
      return selectAll();
    } 

    // Handle Enter key for sending messages or new lines.
    if (key === 'Enter' && !isMobileDevice) {
      e.preventDefault();
      const isEnterSend =
        (messageSendKeyCombo === 'enter' && !(ctrlKey || metaKey || shiftKey)) ||
        (messageSendKeyCombo === 'ctrl-enter' && (ctrlKey || metaKey) && !shiftKey)
      if (isEnterSend) {
        console.warn('Send message');
        // hideTextFormatter();
        // onMessageSend();
        return;
      } else {
        return insertTextAtCaret('\n');
        // return insertComponentAtCaret(<br/>);
      }
    } else if (key === 'Enter' && isMobileDevice) {
      e.preventDefault();
      return insertTextAtCaret('\n');
      // return insertComponentAtCaret(<br/>);
    }
    
    switch (key) {
      case 'Backspace': return selection ? handleDeleteSelection() : handleBackspace();
      case 'Delete': return selection ? handleDeleteSelection() : handleDelete();
      case 'ArrowLeft':
        if (shiftKey) return extendSelectionLeft();
        clearSelection();
        return moveCaretLeft();
      case 'ArrowRight':
        if (shiftKey) return extendSelectionRight();
        clearSelection();
        return moveCaretRight();
      case 'ArrowUp':
        clearSelection();
        e.preventDefault();
        return setCaretToPosition(findVerticalPosition(-1));
      case 'ArrowDown':
        clearSelection();
        e.preventDefault();
        return setCaretToPosition(findVerticalPosition(1));
      default:
        if (!shiftKey && !ctrlKey && !metaKey) clearSelection();
        if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
          return insertTextAtCaret(key);
        }
    }
  });

  const getIndexFromPosition = (x: number, y: number): number | null => {
    const container = contentRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    // outside vertically?
    if (y < rect.top || y > rect.bottom) return null;

    const spans = Array.from(
      container.querySelectorAll<HTMLElement>('span[data-index]')
    );
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const idx = Number(span.dataset.index);
      const srect = span.getBoundingClientRect();
      const centerX = srect.left + (srect.width / 2);

      if (y >= srect.top && y <= srect.bottom) {
        // inside vertically
        if (x < centerX) return idx;
        if (x <= srect.right) return idx + 1;
      }
    }
    // past last span but still in .content vertically
    return spans.length;
  };

  const handleMouseDown = useLastCallback((e: React.MouseEvent) => {
    e.preventDefault();

    // Focus input on click
    textareaRef.current?.focus();

    clearSelection();
    const idx = getIndexFromPosition(e.clientX, e.clientY);
    if (idx != null) {
      // move caret immediately on click
      setCaretToPosition(idx);
      // prepare for drag‐select from here
      isMouseDownRef.current = true;
    }
  });

  const handleMouseMove = useLastCallback((e: React.MouseEvent) => {
    if (!isMouseDownRef.current) return;
    const idx = getIndexFromPosition(e.clientX, e.clientY);
    if (idx == null) return;
    updateMouseSelection(idx);
  });

  // attach a global mouseup listener so we stop selection anywhere
  useEffect(() => {
    const handleMouseUp = useLastCallback(() => {
      isMouseDownRef.current = false;
    });

    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleCopy = useLastCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    console.log('handleCopy');
    if (!selection) return;
    const text = items
      .slice(selection.start, selection.end)
      .map(i => (i.type === 'character' ? i.char : ''))
      .join('');
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  });

  const handleCut = useLastCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!selection) return;
    handleCopy(e);
    handleDeleteSelection();
    clearSelection();
  });

  const handlePaste = useLastCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (selection) {
      handleDeleteSelection();
      clearSelection();
    }
    insertTextAtCaret(pasted);
  });

  const renderItem = (item: InputItem) => {
    // start with raw content
    let node: React.ReactNode;
    if (item.type === 'character') {
      node = item.char;
      if (item.styles) {
        if (item.styles.bold) node = <b>{node}</b>;
        if (item.styles.italic) node = <i>{node}</i>;
        if (item.styles.underline) node = <u>{node}</u>;
        if (item.styles.strikethrough) node = <s>{node}</s>;
      }
    } else {
      node = item.element;
    }
    return node;
  };

  return (
    <div
      id="CustomInput"
      className={buildClassName(!!items.length && 'touched')}
    >
      <textarea
        ref={textareaRef}
        className="textarea"
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
      />

      <div
        ref={contentRef}
        className={buildClassName('input-content', className)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        <p>Ali tutai</p>
        {items.map((item, i) => {
          const isSel = !!selection && i >= selection.start && i < selection.end;
          const beforeCaret = i === caretPosition;
          return (
            <>
              {beforeCaret && <span className="caret"/>}
              <span data-index={i} className={isSel ? 'input-selected' : ''}>
                {renderItem(item)}
              </span>
            </>
          );
        })}
        {caretPosition === items.length && <span className="caret"/>}
      </div>
    </div>
  );
};

export default CustomInput;