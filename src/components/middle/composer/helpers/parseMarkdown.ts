import { ApiMessageEntityTypes } from '../../../../api/types';
import { getPrettyCodeLanguageName } from '../../../../util/prettyCodeLanguageNames';

export type ParseResult = {
  html: string;
  caret: number;
};

const PATTERNS: Array<{ delim: string; tag: string, attr?: string[][] }> = [
  { delim: "**", tag: "b" },
  { delim: "**", tag: "strong" },
  { delim: "__", tag: "i" },
  { delim: "__", tag: "em" },
  { delim: "~~", tag: "del" },
  { delim: "~~", tag: "s" },
  { delim: "~~", tag: "strike" },
  // { delim: "`", tag: "code", attr: [['class', 'text-entity-code']] }, // pre issue (```)
  { delim: "||", tag: "span", attr: [['class', 'spoiler'], ['data-entity-type', 'MessageEntitySpoiler']] },
  { delim: "```", tag: "pre" }
];

export const getDelimByTag = (tag: string): string => {
  console.warn('tag', tag);
  const delim = PATTERNS.find((pattern) => pattern.tag === tag.toLowerCase());
  if (delim) {
    return delim.delim;
  }
  return '??';
};

/**
 * Given a root element, find the text node & offset
 * corresponding to a “flattened” caret position.
 */
function findTextNodeAtOffset(
  root: HTMLElement,
  offset: number
): { node: Text; offsetInNode: number; beforeLength: number } | null {
  let cum = 0;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null
  );

  let txt: Text | null;
  while ((txt = walker.nextNode() as Text | null)) {
    const len = txt.textContent?.length || 0;
    if (cum + len >= offset) {
      return {
        node: txt,
        offsetInNode: offset - cum,
        beforeLength: cum,
      };
    }
    cum += len;
  }
  return null;
}

/**
 * Process a single text‐node’s content for **, __, ~~.
 * Returns a small HTML fragment (string) and adjusted offset.
 */
function processNodeText(
  text: string,
  caretInNode: number
): { htmlFrag: string; newOffset: number } {
  const original = text;
  let nodeHtml = original;
  let localCaret = caretInNode;

  PATTERNS.forEach(({ delim, tag, attr }) => {
    let idx = nodeHtml.indexOf(delim);
    while (idx > -1) {
      const end = nodeHtml.indexOf(delim, idx + delim.length);
      if (end === -1) break;

      const content = nodeHtml.slice(idx + delim.length, end);

      // Skip if there's no real content (empty or only whitespace)
      if (content.trim() === '') {
        idx = nodeHtml.indexOf(delim, end + delim.length);
        continue;
      }

      const before = nodeHtml.slice(0, idx);
      const after = nodeHtml.slice(end + delim.length);
      const attrs = attr ? attr.map(([k, v]) => `${k}="${v}"`).join(' ') : '';
      const frag = `<${tag}${attrs ? ' ' + attrs : ''}>${content}</${tag}>`;
      const removedLen = delim.length * 2;

      // adjust localCaret
      if (localCaret <= idx) {
        // no change
      } else if (localCaret >= end + delim.length) {
        localCaret -= removedLen;
      } else {
        // inside
        const inside = localCaret - idx;
        if (inside <= delim.length) {
          localCaret = idx;
        } else if (inside >= delim.length + content.length) {
          localCaret = idx + content.length;
        } else {
          localCaret = idx + (inside - delim.length);
        }
      }

      nodeHtml = before + frag + after;
      idx = nodeHtml.indexOf(delim, idx + frag.length);
    }
  });

  // only if caret was at end of the ORIGINAL text
  // and we actually changed something (nodeHtml ≠ original),
  // append a single space so typing continues outside the tag
  if (caretInNode === original.length && nodeHtml !== original) {
    nodeHtml += ' ';
    localCaret += 1;
  }

  return { htmlFrag: nodeHtml, newOffset: localCaret };
}

/**
 * Main entry: take your DIV.innerHTML + old caret (flattened),
 * parse only the text‐node at that position, preserve other tags,
 * return new innerHTML + new flattened caret.
 */
export default function parseMarkdown(html: string, caret: number): ParseResult {
  // 0) handle triple‐backtick code blocks globally
  const codeBlockRe = /```(\w*)\n([\s\S]*?)\n```/;
  const cbMatch = codeBlockRe.exec(html);
  if (cbMatch) {
    const [full, lang, code] = cbMatch;
    const idx = cbMatch.index;

    // build the exact same HTML structure your CodeBlock component uses
    const langPretty = getPrettyCodeLanguageName(lang);
    const title = langPretty ? `<p class="code-title">${langPretty}</p>` : '';
    const replacement =
      `<div class="CodeBlock">` +
        title +
        `<pre class="code-block" ` +
          `data-entity-type="${ApiMessageEntityTypes.Pre}" ` +
          `data-language="${langPretty}">` +
          code +
        `</pre>` +
      `</div>`;

    // adjust caret if it was after the fenced block
    if (caret > idx + full.length) {
      caret += replacement.length - full.length;
    }

    html = html.slice(0, idx) + replacement + html.slice(idx + full.length);
  }

  // 1) Build a temporary wrapper
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  // 2) Find the text node + local offset
  const hit = findTextNodeAtOffset(wrapper, caret);
  if (!hit) {
    // nothing to do
    return { html, caret };
  }

  // 3) Process markdown in that node only
  const { htmlFrag, newOffset } = processNodeText(
    hit.node.textContent || '',
    hit.offsetInNode
  );

  // 4) Replace the old text‐node with the fragment
  const range = document.createRange();
  range.setStart(hit.node, 0);
  range.setEnd(hit.node, hit.node.textContent?.length || 0);
  const frag = range.createContextualFragment(htmlFrag);
  hit.node.parentNode!.replaceChild(frag, hit.node);

  // 5) Compute new absolute caret: everything before this node
  //    is unchanged in text length, plus newOffset
  let absolute = hit.beforeLength + newOffset;

  return { html: wrapper.innerHTML, caret: absolute };
}