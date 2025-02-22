import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useRef, useState,
} from '../../../lib/teact/teact';

import type { IAnchorPosition } from '../../../types';
import { ApiMessageEntityTypes } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { ensureProtocol } from '../../../util/ensureProtocol';
import getKeyFromEvent from '../../../util/getKeyFromEvent';
import stopEvent from '../../../util/stopEvent';

import useFlag from '../../../hooks/useFlag';
import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';
import useShowTransitionDeprecated from '../../../hooks/useShowTransitionDeprecated';
import useVirtualBackdrop from '../../../hooks/useVirtualBackdrop';

import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';

import './TextFormatter.scss';

export type OwnProps = {
  getHtml: () => string;
  setHtml: (html: string) => void;
  editableInputId: string;
  isOpen: boolean;
  anchorPosition?: IAnchorPosition;
  selectedRange?: Range;
  setSelectedRange: (range: Range) => void;
  onClose: () => void;
};

interface ISelectedTextFormats {
  image?: boolean;
  link?: boolean
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
  spoiler?: boolean;
  quote?: boolean;
}

interface TextFormatMapping {
  tag: string[];
  format: keyof ISelectedTextFormats;
  attributes?: Record<string, string>;
}

const TEXT_FORMATS: TextFormatMapping[] = [
  { tag: ['IMG'], format: 'image' },
  { tag: ['B', 'STRONG'], format: 'bold' },
  { tag: ['I', 'EM'], format: 'italic' },
  { tag: ['U'], format: 'underline' },
  { tag: ['DEL'], format: 'strikethrough' },
  { tag: ['CODE'], format: 'monospace', attributes: { class: "text-entity-code", dir: 'auto' } },
  { tag: ['SPAN'], format: 'spoiler', attributes: { class: "spoiler", 'data-entity-type': `${ApiMessageEntityTypes.Spoiler}` } },
  { tag: ['A'], format: 'link', attributes: { class: 'text-entity-link', dir: 'auto' } },
  { tag: ['BLOCKQUOTE'], format: 'quote', attributes: { 'data-can-collapse': "false" } },
];

const getFormatByTag = (tagName: string): keyof ISelectedTextFormats | undefined =>
  TEXT_FORMATS.find(f => f.tag.includes(tagName))?.format;

const getTagByFormat = (format: keyof ISelectedTextFormats): string =>
  TEXT_FORMATS.find(f => f.format === format)?.tag[0] || '';

const getAttributesByFormat = (format: keyof ISelectedTextFormats): Record<string, string> =>
  TEXT_FORMATS.find(f => f.format === format)?.attributes || {};

const MAX_REGRESSION_DEPTH = 50;

/**
 * Single Letter Processing
 */
type SlpChar = {
  char: string;
  format: Set<string>;
  href?: string;
  img?: {
    src: string;
    alt: string;
    class?: string;
    draggable?: boolean;
    'data-document-id'?: string;
    'data-unique-id'?: string;
    'data-entity-type'?: string;
  }
}

const fragmentEl = document.createElement('div');

const TextFormatter: FC<OwnProps> = ({
  getHtml,
  setHtml,
  editableInputId,
  isOpen,
  anchorPosition,
  selectedRange,
  setSelectedRange,
  onClose,
}) => {
  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const linkUrlInputRef = useRef<HTMLInputElement>(null);
  const { shouldRender, transitionClassNames } = useShowTransitionDeprecated(isOpen);
  const [isLinkControlOpen, openLinkControl, closeLinkControl] = useFlag();
  const [linkUrl, setLinkUrl] = useState('');
  const [inputClassName, setInputClassName] = useState<string | undefined>();
  const [selectedTextFormats, setSelectedTextFormats] = useState<ISelectedTextFormats>({});


  /**
   * Update selected text formats
   */
  const updateFormatState = useLastCallback(() => {
    const newFormats: ISelectedTextFormats = {};
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      setSelectedTextFormats(newFormats);
      onClose();
      return;
    }

    const range = selection.getRangeAt(0);

    // Look up the formats inside the range
    const clonedFragment = range.cloneContents();
    clonedFragment.querySelectorAll('*').forEach((el) => {
      const tagName = el.tagName;
      const formatKey = getFormatByTag(tagName);
      if (formatKey && formatKey !== 'image') {
        newFormats[formatKey] = true;
      }
    });

    // Look up the formats in the common ancestor container (if nested as well)
    let node: Node | null = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const tagName = (node as HTMLElement).tagName;
      const formatKey = getFormatByTag(tagName);
      if (formatKey) {
        newFormats[formatKey] = true;
      }
      node = (node as HTMLElement).parentElement;
    }

    setSelectedTextFormats(newFormats);
  });

  // Update selected text formats on changes (auto updating list, no need to call after each change)
  useEffect(() => {
    if (!isOpen || !selectedRange) return
    updateFormatState();
  }, [isOpen, selectedRange, openLinkControl, getHtml, updateFormatState]);

  useEffect(() => (isOpen ? captureEscKeyListener(onClose) : undefined), [isOpen, onClose]);
  useVirtualBackdrop(
    isOpen,
    containerRef,
    onClose,
    true,
  );

  useEffect(() => {
    if (isLinkControlOpen) {
      linkUrlInputRef.current!.focus();
    } else {
      setLinkUrl('');
    }
  }, [isLinkControlOpen]);

  useEffect(() => {
    if (!shouldRender) {
      closeLinkControl();
      setSelectedTextFormats({});
      setInputClassName(undefined);
    }
  }, [closeLinkControl, shouldRender]);

  /**
   * Handles apply/remove text format
   * @param range - selected range
   */
  const handleFormat = useLastCallback((format: keyof ISelectedTextFormats, attr?: object) => {
    if (!selectedRange) return;

    // Find absolute start and end offsets
    const startOffset = getAbsoluteRangeOffset(selectedRange, 'start');
    const endOffset = getAbsoluteRangeOffset(selectedRange, 'end');

    // Parse HTML into SLP format
    const html = getHtml();
    const slpTextArray = parseHtmlIntoSLFormat(html);

    if (slpTextArray.length === 0 || slpTextArray.length !== endOffset + 1 - startOffset) {
      console.warn('Error while parsing HTML into SLP format');
      return;
    }

    // Apply/remove format
    const tagName = getTagByFormat(format);
    for (let i = startOffset; i <= endOffset; i++) {
      const char = slpTextArray[i];
      if (selectedTextFormats[format]) {
        char.format.delete(tagName);
      } else {
        char.format.add(tagName);
      }
    }
    // Convert SLP format to HTML
    const newHtml = parseSLFormatIntoHtml(slpTextArray, attr);

    const inputDiv = document.getElementById(editableInputId);
    if (!inputDiv) return;
    inputDiv.innerHTML = newHtml;

    requestAnimationFrame(() => {
      const startRange = getOffsetAndContainerByAbsoluteOffset(inputDiv, startOffset);
      const endRange = getOffsetAndContainerByAbsoluteOffset(inputDiv, endOffset);

      const newRange = document.createRange();
      newRange.setStart(startRange.container, startRange.offset);
      newRange.setEnd(endRange.container, endRange.offset + 1);

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
      setSelectedRange(newRange);
      setHtml(inputDiv.innerHTML);
    });
  });

  /**
   * Get absolute offset of range from text input
   * @param range - selected range
   * @param type - start or end offset
   * @returns - absolute offset
   */
  const getAbsoluteRangeOffset = useLastCallback((range: Range, type: 'start' | 'end'): number => {
    let absoluteOffset = type === 'start' ? range.startOffset : range.endOffset;
    const element = (type === 'start' ? range.startContainer : range.endContainer);

    let regression_depth = 0;
    const getOffsetFromParent = (node: HTMLElement | null) => {
      // Prevent infinite recursion
      regression_depth++;
      if (regression_depth > MAX_REGRESSION_DEPTH) {
        console.warn('Max regression depth reached');
        return;
      }

      if (!node || (node as HTMLElement).id === editableInputId) {
        return;
      }

      // Find offset of node from parent
      const parent = node.parentElement;
      if (!parent) return;
      const children = Array.from(parent.childNodes);
      const index = children.indexOf(node as ChildNode);
      if (index === -1) return;

      // Calculate offset including all nested children
      let parentOffset = 0;
      for (let i = 0; i < index; i++) {
        const child = children[i] as HTMLElement;
        if (child.nodeType === Node.TEXT_NODE) {
          parentOffset += child.textContent?.length || 0;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'IMG') {
            parentOffset += 1;
          } else {
            parentOffset += (child as HTMLElement).innerText.length;
          }
        }
      }

      absoluteOffset += parentOffset;

      getOffsetFromParent(parent);
    }

    // Find absolute offset from parent
    getOffsetFromParent(element as HTMLElement);

    return type === 'start' ? absoluteOffset : absoluteOffset - 1;
  });

  /**
   * Get container and offset by absolute offset
   * @param rootElement - html input element
   * @param offset - absolute offset (calculated before formatting)
   * @returns - html container and offset
   */
  const getOffsetAndContainerByAbsoluteOffset = (rootElement: HTMLElement, offset: number) => {
    let currentOffset = 0;
    let result: { container: Node; offset: number } | null = null;

    const walk = (node: Node) => {
      if (result) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length || 0;
        if (currentOffset <= offset && offset < currentOffset + length) {
          result = { container: node, offset: offset - currentOffset };
        }
        currentOffset += length;
      } else {
        const element = node as HTMLElement;
        if (element.tagName === 'IMG') {
          currentOffset++;
        }
        node.childNodes.forEach(walk);
      }
    };

    walk(rootElement);
    return result || { container: rootElement, offset: 0 };
  };

  /**
   * Parse HTML into SLP format
   * @param html - HTML string
   * @returns - SLP format array
   */
  const parseHtmlIntoSLFormat = useLastCallback((html: string): SlpChar[] => {
    const parser = new DOMParser();

    // Wrap HTML into pre tag to parse it
    // Pre tag used to preserve spaces at the begginning of string
    const wrappedHTML = `<pre>${html}</pre>`;
    const root = parser.parseFromString(wrappedHTML, 'text/html').body.querySelector('pre')!;

    const slpArray: SlpChar[] = [];
    let regression_depth = 0;
    const getSlfFromNode = (children: ChildNode[], parentFormat: Set<string>) => {
      // Prevent infinite recursion
      regression_depth++;
      if (regression_depth > MAX_REGRESSION_DEPTH) {
        console.warn('Max regression depth reached');
        return;
      }

      // Get children
      children.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent || '';
          const textArray = text.split('');
          textArray.forEach((char) => {
            slpArray.push({ char, format: new Set([...parentFormat]) });
          });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const element = child as HTMLElement;
          const format = element.tagName;

          // Handle emojis
          if (format === getTagByFormat('image')) {
            slpArray.push({
              char: '',
              format: new Set([...parentFormat, format]),
              img: {
                src: element.getAttribute('src') || '',
                alt: element.getAttribute('alt') || '',
                class: element.getAttribute('class') || '',
                draggable: element.getAttribute('draggable') === 'true',
                'data-document-id': element.getAttribute('data-document-id') || '',
                'data-unique-id': element.getAttribute('data-unique-id') || '',
                'data-entity-type': element.getAttribute('data-entity-type') || '',
              }
            });
            return;
          }

          const formatArray = format ? [format] : [];
          getSlfFromNode(Array.from(element.childNodes), new Set([...parentFormat, ...formatArray]));
        }
      });
    }

    getSlfFromNode(Array.from(root.childNodes), new Set());
    return slpArray;
  });

  /**
   * Parse SLP format into HTML
   * @param slpArray - SLP format array
   * @returns - HTML string
   */
  const parseSLFormatIntoHtml = useLastCallback((slpArray: SlpChar[], attr?): string => {
    // Get format length in array
    const getFormatLength = (format: string, array: SlpChar[]): number => {
      let length = 0;
      if (format === 'IMG') return 1;
      for (let i = 0; i < array.length; i++) {
        if (array[i].format.has(format)) {
          length++;
        } else {
          break;
        }
      }
      return length;
    }

    let regression_depth = 0;
    const parseSlpArray = (array: SlpChar[], type: string): HTMLElement => {
      const new_format = getFormatByTag(type);
      const attributes = getAttributesByFormat(new_format as keyof ISelectedTextFormats);

      // Handle link
      if (new_format === 'link') {
        attributes.href = attr?.href || '';
      }

      // Handle image
      if (new_format === 'image') {
        const attr = array[0]?.img;
        const img = document.createElement('img');
        img.src = attr?.src || '';
        img.alt = attr?.alt || '';
        img.className = attr?.class || '';
        img.draggable = attr?.draggable || false;
        img.setAttribute('data-document-id', attr?.['data-document-id'] || '');
        img.setAttribute('data-unique-id', attr?.['data-unique-id'] || '');
        img.setAttribute('data-entity-type', attr?.['data-entity-type'] || '');
        return img;
      }

      const mainEl = document.createElement(type);
      Object.entries(attributes).forEach(([key, value]) => {
        mainEl.setAttribute(key, value);
      });

      // Prevent infinite recursion
      regression_depth++;
      if (regression_depth > MAX_REGRESSION_DEPTH) {
        return mainEl;
      }

      for (let i = 0; i < array.length; i++) {
        if (array[i].format.size === 0) {
          mainEl.appendChild(document.createTextNode(array[i].char));
        } else {
          let maxLengthFormat: { format: string, length: number } = { format: '', length: 0 };
          array[i].format.forEach((format) => {
            const length = getFormatLength(format, array.slice(i));
            if (length > maxLengthFormat.length) {
              maxLengthFormat = { format, length };
            }
          });

          // Delete format from elements i -> i + formatLengths[maxFormatLengthId] and parse it
          const subArray = array.slice(i, i + maxLengthFormat.length)
          subArray.forEach((el) => el.format.delete(maxLengthFormat.format));
          const el = parseSlpArray(subArray, maxLengthFormat.format);
          mainEl.appendChild(el);

          i += maxLengthFormat.length - 1;
        }
      }

      return mainEl;
    }

    const el = parseSlpArray(slpArray, 'div');
    return el.innerHTML;
  });

  const handleBoldText = () => handleFormat('bold');
  const handleItalicText = () => handleFormat('italic');
  const handleUnderlineText = () => handleFormat('underline');
  const handleStrikethroughText = () => handleFormat('strikethrough');
  const handleMonospaceText = () => handleFormat('monospace');
  const handleBlockquoteText = () => handleFormat('quote');
  const handleSpoilerText = () => handleFormat('spoiler');
  const handleLinkText = () => {
    const formattedLinkUrl = (ensureProtocol(linkUrl) || '').split('%').map(encodeURI).join('%');
    handleFormat('link', { href: formattedLinkUrl });
    closeLinkControl();
  }

  const handleKeyDown = useLastCallback((e: KeyboardEvent) => {
    const HANDLERS_BY_KEY: Record<string, AnyToVoidFunction> = {
      k: openLinkControl,
      b: handleBoldText,
      u: handleUnderlineText,
      i: handleItalicText,
      m: handleMonospaceText,
      s: handleStrikethroughText,
      p: handleSpoilerText,
    };

    const handler = HANDLERS_BY_KEY[getKeyFromEvent(e)];

    if (
      e.altKey
      || !(e.ctrlKey || e.metaKey)
      || !handler
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    handler();
  });

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const lang = useOldLang();

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && isLinkControlOpen) {
      handleLinkText();
      e.preventDefault();
    }
  }

  if (!shouldRender) {
    return undefined;
  }

  const className = buildClassName(
    'TextFormatter',
    transitionClassNames,
    isLinkControlOpen && 'link-control-shown',
  );

  const linkUrlConfirmClassName = buildClassName(
    'TextFormatter-link-url-confirm',
    Boolean(linkUrl.length) && 'shown',
  );

  const style = anchorPosition
    ? `left: ${anchorPosition.x}px; top: ${anchorPosition.y}px;--text-formatter-left: ${anchorPosition.x}px;`
    : '';

  const getFormatButtonClassName = (key: keyof ISelectedTextFormats) => {
    if (selectedTextFormats[key]) {
      return 'active';
    }

    // With new approach, appling formating is not an issue for strike and monospace
    // However, monospace is not working properly with link (onClick text is being copy only) and with bold (<b> applied but not displayed)
    if (key === 'monospace' || key === 'quote') {
      if (Object.keys(selectedTextFormats).some(
        (fKey) => fKey !== key && Boolean(selectedTextFormats[fKey as keyof ISelectedTextFormats]),
      )) {
        return 'disabled';
      }
    } else if (selectedTextFormats.monospace || selectedTextFormats.quote) {
      return 'disabled';
    }

    return undefined;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      onKeyDown={handleContainerKeyDown}
      // Prevents focus loss when clicking on the toolbar
      onMouseDown={stopEvent}
    >
      <div className="TextFormatter-buttons">
        <Button
          color="translucent"
          ariaLabel="Spoiler text"
          className={getFormatButtonClassName('spoiler')}
          onClick={handleSpoilerText}
        >
          <Icon name="eye-closed" />
        </Button>
        <div className="TextFormatter-divider" />
        <Button
          color="translucent"
          ariaLabel="Bold text"
          className={getFormatButtonClassName('bold')}
          onClick={handleBoldText}
        >
          <Icon name="bold" />
        </Button>
        <Button
          color="translucent"
          ariaLabel="Italic text"
          className={getFormatButtonClassName('italic')}
          onClick={handleItalicText}
        >
          <Icon name="italic" />
        </Button>
        <Button
          color="translucent"
          ariaLabel="Underlined text"
          className={getFormatButtonClassName('underline')}
          onClick={handleUnderlineText}
        >
          <Icon name="underlined" />
        </Button>
        <Button
          color="translucent"
          ariaLabel="Strikethrough text"
          className={getFormatButtonClassName('strikethrough')}
          onClick={handleStrikethroughText}
        >
          <Icon name="strikethrough" />
        </Button>
        <Button
          color="translucent"
          ariaLabel="Monospace text"
          className={getFormatButtonClassName('monospace')}
          onClick={handleMonospaceText}
        >
          <Icon name="monospace" />
        </Button>
        <Button
          color="translucent"
          ariaLabel="Quote"
          className={getFormatButtonClassName('quote')}
          onClick={handleBlockquoteText}
        >
          <Icon name="quote" />
        </Button>
        <div className="TextFormatter-divider" />
        <Button
          className={getFormatButtonClassName('link')}
          color="translucent"
          ariaLabel={lang('TextFormat.AddLinkTitle')}
          onClick={() => { selectedTextFormats.link ? handleFormat('link') : openLinkControl() }}
        >
          <Icon name="link" />
        </Button>
      </div>

      <div className="TextFormatter-link-control">
        <div className="TextFormatter-buttons">
          <Button color="translucent" ariaLabel={lang('Cancel')} onClick={closeLinkControl}>
            <Icon name="arrow-left" />
          </Button>
          <div className="TextFormatter-divider" />

          <div
            className={buildClassName('TextFormatter-link-url-input-wrapper', inputClassName)}
          >
            <input
              ref={linkUrlInputRef}
              className="TextFormatter-link-url-input"
              type="text"
              value={linkUrl}
              placeholder="Enter URL..."
              autoComplete="off"
              inputMode="url"
              dir="auto"
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>

          <div className={linkUrlConfirmClassName}>
            <div className="TextFormatter-divider" />
            <Button
              color="translucent"
              ariaLabel={lang('Save')}
              className={"color-primary"}
              onClick={handleLinkText}
            >
              <Icon name="check" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(TextFormatter);
