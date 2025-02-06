import { requestMeasure, requestMutation } from '../lib/fasterdom/fasterdom';
import { IS_TOUCH_ENV } from './windowEnvironment';

export default function focusEditableElement(element: HTMLElement, force?: boolean, forcePlaceCaretAtEnd?: boolean) {
  if (!force && element === document.activeElement) {
    return;
  }

  requestMeasure(() => {
    const lastChild = element.lastChild || element;
    const selection = window.getSelection()!;

    if (!IS_TOUCH_ENV && !forcePlaceCaretAtEnd && (!lastChild || !lastChild.nodeValue)) {
      element.focus();
      return;
    }

    requestMutation(() => {
      const range = document.createRange();
      range.selectNodeContents(forcePlaceCaretAtEnd ? element : lastChild);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  });
}
