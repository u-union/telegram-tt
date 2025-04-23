const extractorEl = document.createElement('div');

export function insertHtmlInSelection(html: string) {
  const selection = window.getSelection();

  if (selection?.getRangeAt && selection.rangeCount) {
    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragment = range.createContextualFragment(html);
    const lastInsertedNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastInsertedNode) {
      range.setStartAfter(lastInsertedNode);
      range.setEndAfter(lastInsertedNode);
    } else {
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export function getHtmlBeforeSelection(container?: HTMLElement, useCommonAncestor?: boolean) {
  if (!container) {
    return '';
  }

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) {
    return container.innerHTML;
  }

  const range = sel.getRangeAt(0).cloneRange();
  if (!range.intersectsNode(container)) {
    return container.innerHTML;
  }

  if (!useCommonAncestor && !container.contains(range.commonAncestorContainer)) {
    return '';
  }

  range.collapse(true);
  range.setStart(container, 0);

  extractorEl.innerHTML = '';
  extractorEl.appendChild(range.cloneContents());

  return extractorEl.innerHTML;
}

// https://stackoverflow.com/a/3976125
export function getCaretPosition(element: HTMLElement) {
  let caretPosition = 0;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return caretPosition;
  }

  const range = selection.getRangeAt(0);
  const caretRange = range.cloneRange();
  caretRange.selectNodeContents(element);
  caretRange.setEnd(range.endContainer, range.endOffset);
  caretPosition = caretRange.toString().length;

  return caretPosition;
}

// https://stackoverflow.com/a/36953852
export function setCaretPosition(element: Node, position: number) {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node as Text).length >= position) {
        const range = document.createRange();
        const selection = window.getSelection()!;
        range.setStart(node, position);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return -1;
      } else {
        position -= 'length' in node ? node.length as number : 0;
      }
    } else {
      position = setCaretPosition(node, position);
      if (position === -1) {
        return -1;
      }
    }
  }

  return position;
}

export function setCaretPositionToLast(element: HTMLElement) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  removeAllSelections();
  selection?.addRange(range);
}

export function removeAllSelections() {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.empty(); // Old browsers support
}

  /**
   * Get absolute start and end offsets of a Range within a contenteditable element
   * @param range - selected Range
   * @param editableInputId - ID of the editable element
   * @returns an object with { start, end }
   */
  export function getAbsoluteRangeOffsets(range: Range, editableInputId: string): { start: number; end: number } {
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;
    let regressionDepth = 0;

    function accumulateOffset(node: Node | null): number {
      if (!node || (node as HTMLElement).id === editableInputId || regressionDepth > 50) {
        return 0;
      }
      regressionDepth++;

      const parent = node.parentNode as HTMLElement;
      if (!parent) {
        return 0;
      }

      const siblings = Array.from(parent.childNodes);
      const index = siblings.indexOf(node as ChildNode);
      if (index < 0) {
        return 0;
      }

      let offset = 0;
      for (let i = 0; i < index; i++) {
        const sibling = siblings[i];
        if (sibling.nodeType === Node.TEXT_NODE) {
          offset += sibling.textContent?.length || 0;
        } else if (sibling.nodeType === Node.ELEMENT_NODE) {
          if ((sibling as HTMLElement).tagName === 'IMG') {
            offset += 1;
          } else {
            offset += (sibling as HTMLElement).innerText.length;
          }
        }
      }
      return offset + accumulateOffset(parent);
    }

    regressionDepth = 0;
    startOffset += accumulateOffset(range.startContainer);
    regressionDepth = 0;
    endOffset += accumulateOffset(range.endContainer);

    // Match original logic by subtracting 1 from end offset
    endOffset -= 1;

    return { start: startOffset, end: endOffset };
  }
