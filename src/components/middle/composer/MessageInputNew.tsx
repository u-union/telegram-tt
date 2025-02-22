import React, { FC, memo, RefObject, getIsHeavyAnimating, useRef, useEffect, useLayoutEffect, useState } from "../../../lib/teact/teact";
import { type ChangeEvent } from "react";

import useLang from "../../../hooks/useLang";
import useFlag from "../../../hooks/useFlag";
import useAppLayout from '../../../hooks/useAppLayout';
import useLastCallback from "../../../hooks/useLastCallback";
import useDerivedState from "../../../hooks/useDerivedState";
import useInputCustomEmojis from "./hooks/useInputCustomEmojis";
import { requestMeasure, requestMutation } from "../../../lib/fasterdom/fasterdom";

import { isSelectionInsideInput } from './helpers/selection';

import { getActions, withGlobal } from '../../../global';
import { selectCanPlayAnimatedEmojis, selectDraft, selectIsInSelectMode } from '../../../global/selectors';

import type { ApiInputMessageReplyInfo } from '../../../api/types';
import type { IAnchorPosition, ISettings, ThreadId } from '../../../types';

import { ComposerType } from "../../common/Composer";
import renderText from "../../common/helpers/renderText";
import Icon from '../../common/icons/Icon';

import buildClassName from '../../../util/buildClassName';
import focusEditableElement from "../../../util/focusEditableElement";
import { removeAllSelections, setCaretPositionToLast } from "../../../util/selection";
import { Signal } from "../../../util/signals";
import parseEmojiOnlyString from '../../../util/emoji/parseEmojiOnlyString';
import { IS_ANDROID, IS_EMOJI_SUPPORTED, IS_IOS, IS_TOUCH_ENV } from '../../../util/windowEnvironment';
import { debounce } from "../../../util/schedulers";
import captureKeyboardListeners from "../../../util/captureKeyboardListeners";

import Button from '../../ui/Button';
import TextTimer, { TextTimerDetails } from '../../ui/TextTimer';
import TextFormatter from './TextFormatter.async';

import './MessageInputNew.scss';

const INPUT_SCROLLER_CLASS = 'input-scroller';

const INPUT_BOX_FOCUS_DELAY_MS = 350;
const TEXT_FORMATTER_SAFE_AREA_PX = 140;
const SELECTION_RECALCULATE_DELAY_MS = 260;
const TAB_INDEX_PRIORITY_TIMEOUT = 2000;
const MAX_ATTACHMENT_MODAL_INPUT_HEIGHT = 160;
const MAX_STORY_MODAL_INPUT_HEIGHT = 128;
const TRANSITION_DURATION_FACTOR = 50;

type OwnProps = {
  inputRef: RefObject<HTMLDivElement | null>;
  type: ComposerType;
  id: string;
  chatId: string;
  threadId: ThreadId;
  canAutoFocus?: boolean;
  canSendPlainText?: boolean;
  captionLimit?: number;
  editableInputId: string;
  forcedPlaceholder?: string;
  getHtmlInputText: Signal<string>;
  hasAttachments: boolean;
  isNeedPremium?: boolean;
  isReady: boolean;
  placeholder: string;
  shouldSuppressTextFormatter?: boolean;
  timerPlaceholderData?: TextTimerDetails;
  onInputHtmlChange: (html: string) => void;
  onInputHtmlUndo?: () => boolean;
  onInputHtmlRedo?: () => boolean;
  onMessageSend: NoneToVoidFunction;
  onInputBoxFocus?: NoneToVoidFunction;
  onInputBoxBlur?: NoneToVoidFunction;
};

type StateProps = {
  replyInfo?: ApiInputMessageReplyInfo;
  isSelectModeActive?: boolean;
  messageSendKeyCombo?: ISettings['messageSendKeyCombo'];
  canPlayAnimatedEmojis: boolean;
};

const MessageInputNew: FC<OwnProps & StateProps> = ({
  inputRef,
  type,
  id,
  chatId,
  threadId,
  canAutoFocus,
  canSendPlainText,
  captionLimit,
  editableInputId,
  forcedPlaceholder,
  hasAttachments,
  getHtmlInputText,
  isNeedPremium,
  isReady,
  placeholder,
  replyInfo,
  isSelectModeActive,
  canPlayAnimatedEmojis,
  messageSendKeyCombo,
  shouldSuppressTextFormatter,
  timerPlaceholderData,
  onInputHtmlChange,
  onInputHtmlUndo,
  onInputHtmlRedo,
  onMessageSend,
  onInputBoxFocus,
  onInputBoxBlur,
  // onScroll,
}) => {
  const htmlRef = useRef<string>('');
  const inputBoxCloneRef = useRef<HTMLDivElement>(null);
  const inputScrollerCloneRef = useRef<HTMLDivElement>(null);
  const inputBoxPlaceholderRef = useRef<HTMLDivElement>(null);

  const sharedCanvasRef = useRef<HTMLCanvasElement>(null);
  const sharedCanvasHqRef = useRef<HTMLCanvasElement>(null);
  const absoluteContainerRef = useRef<HTMLDivElement>(null);

  const lang = useLang();
  // Is Story Input or Attachment Modal Input or neither
  const isStoryInput = type === 'story';
  const isAttachmentModalInput = type === 'caption';
  const isActive = isAttachmentModalInput === hasAttachments;
  const isNeedPremiumInStory = isStoryInput && isNeedPremium;

  const { isMobile } = useAppLayout();
  const isMobileDevice = !!isMobile && (IS_IOS || IS_ANDROID);
  const maxInputHeight = isAttachmentModalInput
    ? MAX_ATTACHMENT_MODAL_INPUT_HEIGHT
    : isStoryInput ? MAX_STORY_MODAL_INPUT_HEIGHT : (isMobile ? 256 : 416);

  // Selection / Text Formatter
  const [selectedRange, setSelectedRange] = useState<Range>();
  const [isTextFormatterOpen, displayTextFormatter, hideTextFormatter] = useFlag();
  const [textFormatterAnchorPosition, setTextFormatterAnchorPosition] = useState<IAnchorPosition>();

  // Slow / Stelth Mode timer
  const [isPlaceholderTimerDisplayed, displayPlaceholderTimer, hidePlaceholderTimer] = useFlag();
  useLayoutEffect(() => {
    if (timerPlaceholderData?.langKey && timerPlaceholderData?.endsAt) {
      displayPlaceholderTimer();
    }
  }, [timerPlaceholderData]);

  const {
    editLastMessage,
    replyToNextMessage,
    showAllowedMessageTypesNotification,
    openPremiumModal,
  } = getActions();

  useInputCustomEmojis(
    getHtmlInputText,
    inputRef,
    sharedCanvasRef,
    sharedCanvasHqRef,
    absoluteContainerRef,
    isAttachmentModalInput ? 'attachment' : type,
    canPlayAnimatedEmojis,
    isReady,
    isActive,
  );

  // MessageInput Component Class
  const messageInputClass = buildClassName(
    'MessageInput',
    `${type}-input-text`,
  );
  const inputScrollerClass = buildClassName(
    'custom-scroll',
    INPUT_SCROLLER_CLASS,
    isNeedPremiumInStory && 'is-need-premium',
  )
  const inputScrollerContentClass = buildClassName(
    'input-scroller-content',
    isNeedPremiumInStory && 'is-need-premium'
  );

  const inputBoxClass = useDerivedState(() => {
    const isTouched = Boolean(isActive && getHtmlInputText());
    return buildClassName(
      'form-control allow-selection',
      isTouched && 'touched',
    );
  }, [getHtmlInputText, hasAttachments, isActive]);

  const inputPlaceholderClass = buildClassName(
    'placeholder-text',
    !isAttachmentModalInput && !canSendPlainText && 'with-icon',
    isNeedPremiumInStory && 'is-need-premium'
  );

  /**
   * Update the input box height based on the content
   * Allows to use (flexible) transition duration based on the height difference
   */
  const updateMessageInputHeight = useLastCallback(() => {
    requestMeasure(() => {
      // Get the input scroller element (closest to current input element)
      const inputScroller = inputRef.current?.closest<HTMLDivElement>(`.${INPUT_SCROLLER_CLASS}`);
      if (!inputScroller) return;
      // Get the current height of the input scroller
      const currentHeight = Number(inputScroller.style.height.replace('px', ''));
      // Get the scroll height of the input element
      const { scrollHeight } = inputScrollerCloneRef.current!;
      // Calculate the new height of the input scroller and if it didn't change, return
      const newHeight = Math.min(scrollHeight, maxInputHeight);
      if (newHeight === currentHeight) return;
      const isOverflown = scrollHeight > maxInputHeight

      // Mutation phase: update height and transition time
      requestMutation(() => {
        const transitionDuration = Math.round(
          TRANSITION_DURATION_FACTOR * Math.log(Math.abs(newHeight - currentHeight)),
        );
        inputScroller.style.height = `${newHeight}px`;
        inputScroller.style.transitionDuration = `${transitionDuration}ms`;
        inputScroller.classList.toggle('overflown', isOverflown);
      });
    });
  });

  /**
   * Initialize the scroller input height with offsetHeigth
   * is a @fix - at first height change, transition is not working
   */
  useLayoutEffect(() => {
    requestMeasure(() => {
      const height = inputBoxCloneRef.current?.offsetHeight;
      const inputScroller = inputRef.current?.closest<HTMLDivElement>(`.${INPUT_SCROLLER_CLASS}`);
      if (!inputScroller || !height) return;

      requestMutation(() => {
        inputScroller.style.height = `${height}px`;
      });
    });
  }, []);

  /**
   * Initialize the input box with current HTML signal value
   */
  useLayoutEffect(() => {
    const html = isActive ? getHtmlInputText() : '';

    if (html !== inputRef.current!.innerHTML) {
      requestMutation(() => {
        inputRef.current!.innerHTML = html;
        setCaretPositionToLast(inputRef.current!);
      });
    }

    if (html !== inputBoxCloneRef.current!.innerHTML) {
      inputBoxCloneRef.current!.innerHTML = html;
    }

    if (html !== htmlRef.current) {
      htmlRef.current = html;

      updateMessageInputHeight();
    }

  }, [getHtmlInputText, hasAttachments]);

  /**
   * Manually focus on the input box
   */
  const focusOnInputBox = useLastCallback(() => {
    if (!inputRef.current || isNeedPremiumInStory) return;

    if (getIsHeavyAnimating()) {
      setTimeout(focusOnInputBox, INPUT_BOX_FOCUS_DELAY_MS);
    } else {
      focusEditableElement(inputRef.current!, true)
    }
  });

  /**
   * Focus on the input box when the chat is opened or the reply info is set
   */
  useEffect(() => {
    if (!IS_TOUCH_ENV && canAutoFocus) {
      focusOnInputBox();
    }
  }, [chatId, replyInfo, canAutoFocus]);


  /**
   * Focus on the input box first on 'Tab' key press
   */
  useEffect(() => {
    const captureFirstTab = debounce((e: KeyboardEvent) => {
      if (e.key === 'Tab' && !inputRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        focusOnInputBox();
      }
    }, TAB_INDEX_PRIORITY_TIMEOUT, true, false);

    return captureKeyboardListeners({ onTab: captureFirstTab });
  }, [focusOnInputBox]);

  /**
   * Handle the click event on the whole MessageInput container
   */
  const handleMessageInputClick = useLastCallback(() => {
    // If Input is forbidden, show notification
    if (!isAttachmentModalInput && !canSendPlainText && isNeedPremiumInStory) {
      showAllowedMessageTypesNotification({ chatId });
    }
  });

  /**
   * Handle the change event inside the input box
   */
  const handleInputBoxChange = useLastCallback((e: ChangeEvent<HTMLDivElement>) => {
    const { innerHTML, textContent } = e.currentTarget;

    if (
      (!textContent || !textContent.length) // Empty text
      && !(!IS_EMOJI_SUPPORTED && innerHTML.includes('emoji-small')) // No small emoji
      && !(innerHTML.includes('custom-emoji')) // No custom emoji
    ) {
      onInputHtmlChange('');

      // Remove any active styling when input is cleared
      if (window.getSelection()) {
        inputRef.current!.blur();
        removeAllSelections();
        focusOnInputBox();
      }
    } else {
      onInputHtmlChange(innerHTML);
    }
  });

  /**
   * Shake an element with a shake-effect class
   * @param element - HTMLElement to vibrate
   * @returns 
   */
  const shakeElement = (element: HTMLElement | null) => {
    if (!element || !element.classList || element.classList.contains('shake-effect')) return;

    requestMutation(() => element.classList.add('shake-effect'));
    setTimeout(() => {
      requestMutation(() => element.classList.remove('shake-effect'));
    }, 300); // same as animation (no sense to change)
  }

  /**
   * Handle the key event inside the input box
   */
  const handleInputBoxKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const { isComposing, key, ctrlKey, altKey, metaKey, shiftKey } = e
    const inputHTML = getHtmlInputText();

    if (!isComposing) {
      // Handle Ctrl/Cmd + Z/Y for undo/redo
      if ((ctrlKey || metaKey) && (key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) {
        e.preventDefault();
        // Redo (Ctrl/Cmd+Y) or (Ctrl/Cmd+Shift+Z)
        if (key.toLowerCase() === 'y' || (shiftKey && key.toLowerCase() === 'z')) {
          if (onInputHtmlRedo?.()) {
            shakeElement(getHtmlInputText() ? inputRef?.current : inputBoxPlaceholderRef?.current);
          }
        }
        // Undo (Ctrl/Cmd+Z)
        else if (key.toLowerCase() === 'z') {
          if (onInputHtmlUndo?.()) {
            shakeElement(getHtmlInputText() ? inputRef?.current : inputBoxPlaceholderRef?.current); id
          }
        }
        return;
      }

      // Handle ctrl/meta + ArrowUp/ArrowDown shortcuts for reply message navigation.
      if (!inputHTML && (metaKey || ctrlKey) && (key === 'ArrowUp' || key === 'ArrowDown')) {
        const targetIndexDelta = key === 'ArrowDown' ? 1 : -1;
        replyToNextMessage({ targetIndexDelta });
        e.preventDefault();
        return;
      }

      // Handle Enter key for sending messages.
      if (key === 'Enter' && !shiftKey && !isMobileDevice) {
        e.preventDefault();
        const isEnterSend =
          (messageSendKeyCombo === 'enter') ||
          (messageSendKeyCombo === 'ctrl-enter' && (ctrlKey || metaKey));
        if (isEnterSend) {
          hideTextFormatter();
          onMessageSend();
          return;
        }
      }

      // Handle standalone ArrowUp for editing the last message.
      if (e.key === 'ArrowUp' && !inputHTML && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        editLastMessage();
        return;
      }
    }
    e.target.addEventListener('keyup', debouncedHandleTextFormatterDisplay, { once: true });
  });

  /**
   * Handle the mouse down event inside the input box
   */
  const handleInputBoxMouseDown = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const { button } = e;
    button === 0 && addEventListener('mouseup', debouncedHandleTextFormatterDisplay, { once: true });
  });

  /**
   * Check if text is selected and valid for text formatter
   * @returns boolean
   */
  const isTextSelected = useLastCallback(() => {
    const selection = window.getSelection();
    const selectionRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const selectedText = selectionRange?.toString().trim();

    if (
      !selectionRange // No selection
      || !isSelectionInsideInput(selectionRange, editableInputId) // Selection outside the input
      || !selectionRange.START_TO_END // Selection is collapsed
      || !selectedText // No text selected
      || parseEmojiOnlyString(selectedText) // Only emojis selected
    ) {
      requestMutation(() => {
        hideTextFormatter();
      });
      return false;
    }
    return true;
  });

  /**
   * Handles text formatter display/hide and position
   */
  const handleTextFormatterDisplay = useLastCallback(() => {
    requestMeasure(() => {
      if (!isTextSelected()) return false;
      
      const selection = window.getSelection();
      const selectionRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

      /** Calculate the position of the text formatter */
      const selectionRect = selectionRange?.getBoundingClientRect();
      const scrollerElement = inputRef.current!.closest<HTMLDivElement>(`.${INPUT_SCROLLER_CLASS}`);
      if (!scrollerElement || !selectionRect) return false;
      const scrollerRect = scrollerElement.getBoundingClientRect();

      let x = (selectionRect.left + selectionRect.width / 2) - scrollerRect.left;
      if (x < TEXT_FORMATTER_SAFE_AREA_PX) {
        x = TEXT_FORMATTER_SAFE_AREA_PX;
      } else if (x > scrollerRect.width - TEXT_FORMATTER_SAFE_AREA_PX) {
        x = scrollerRect.width - TEXT_FORMATTER_SAFE_AREA_PX;
      }
      const y = Math.max(selectionRect.top - scrollerRect.top, 0)

      /** Set the anchor position and selected text, then display the text formatter */
      requestMutation(() => {
        setTextFormatterAnchorPosition({ x, y});
        setSelectedRange(selectionRange || undefined);
        displayTextFormatter();
      });
    });
  });
  // Text Formatter Handler with Debounce
  const debouncedHandleTextFormatterDisplay = debounce(handleTextFormatterDisplay, SELECTION_RECALCULATE_DELAY_MS, false);


  // Handle the Android Context Menu when text is selected
  const handleAndroidContextMenu = useLastCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!isTextSelected()) return;

    e.preventDefault();
    e.stopPropagation();
    handleTextFormatterDisplay();
  });

  return (
    <div id={id} className={messageInputClass} onClick={handleMessageInputClick}>
      <div className={inputScrollerClass} >
        <div className={inputScrollerContentClass}>
          <div
            className={inputBoxClass}
            id={editableInputId}
            aria-label={placeholder}
            ref={inputRef}
            role="textbox"
            dir='auto'
            contentEditable={isAttachmentModalInput || canSendPlainText}
            onChange={handleInputBoxChange}
            onKeyDown={handleInputBoxKeyDown}
            onMouseDown={handleInputBoxMouseDown}
            onContextMenu={IS_ANDROID ? handleAndroidContextMenu : undefined}
            onTouchCancel={IS_ANDROID ? debouncedHandleTextFormatterDisplay : undefined}
            onFocus={!isNeedPremiumInStory ? onInputBoxFocus : undefined}
            onBlur={!isNeedPremiumInStory ? onInputBoxBlur : undefined}
          />
          {!forcedPlaceholder && (<span
            ref={inputBoxPlaceholderRef}
            className={inputPlaceholderClass}
            dir="auto"
          >
            {!isAttachmentModalInput && !canSendPlainText
              && <Icon name="lock-badge" className="placeholder-icon" />}
            {isPlaceholderTimerDisplayed && timerPlaceholderData ?
              <TextTimer details={timerPlaceholderData} onEnd={hidePlaceholderTimer} />
              : placeholder}
            {isNeedPremiumInStory && (
              <Button className="unlock-button" size="tiny" color="adaptive" onClick={() => openPremiumModal}>
                {lang('StoryRepliesLockedButton')}
              </Button>
            )}
          </span>)}
          <canvas ref={sharedCanvasRef} className="shared-canvas" />
          <canvas ref={sharedCanvasHqRef} className="shared-canvas" />
          <div ref={absoluteContainerRef} className="absolute-video-container" />
        </div>
      </div>
      <div ref={inputScrollerCloneRef} className={buildClassName(inputScrollerClass, 'clone')}>
        <div className={inputScrollerContentClass}>
          <div ref={inputBoxCloneRef} className={buildClassName(inputBoxClass, 'clone')} dir="auto" />
        </div>
      </div>
      {captionLimit !== undefined && isActive && (
        <div className="max-length-indicator" dir="auto">
          {captionLimit}
        </div>
      )}
      <TextFormatter
        getHtml={getHtmlInputText}
        setHtml={onInputHtmlChange}
        editableInputId={editableInputId}
        isOpen={isTextFormatterOpen}
        anchorPosition={textFormatterAnchorPosition}
        selectedRange={selectedRange}
        setSelectedRange={setSelectedRange}
        onClose={() => { hideTextFormatter(); removeAllSelections(); }}
      />
      {forcedPlaceholder && <span className="forced-placeholder">{renderText(forcedPlaceholder!)}</span>}
    </div>
  );
}

export default memo(withGlobal<OwnProps>(
  (global, { chatId, threadId }: OwnProps): StateProps => {
    const { messageSendKeyCombo } = global.settings.byKey;

    return {
      messageSendKeyCombo,
      replyInfo: chatId && threadId ? selectDraft(global, chatId, threadId)?.replyInfo : undefined,
      isSelectModeActive: selectIsInSelectMode(global),
      canPlayAnimatedEmojis: selectCanPlayAnimatedEmojis(global),
    };
  },
)(MessageInputNew));
