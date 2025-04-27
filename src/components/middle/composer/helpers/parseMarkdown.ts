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
  { delim: "||", tag: "span", attr: [['class', 'spoiler markdown-text'], ['data-entity-type', 'MessageEntitySpoiler']] },
  { delim: "```", tag: "pre" },
  // { delim: ">", tag: "blockquote", attr: [['class', 'blockquote']] },
];

export const getDelimByTag = (tag: string): string => {
  const delim = PATTERNS.find((pattern) => pattern.tag === tag.toLowerCase());
  if (delim) {
    return delim.delim;
  }
  return '`';
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
  let nodeHtml = text;
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
      const frag = `<${tag}${attrs ? ' ' + attrs : ''} class="markdown-text">${content}</${tag}>`;

      // adjust localCaret
      if (localCaret <= idx) {
        // no change
      } else {
        localCaret -= delim.length * 2;
      }

      nodeHtml = before + frag + after;

      // append a single space so typing continues outside the tag
      nodeHtml += ' ';
      localCaret += 1;
      idx = nodeHtml.indexOf(delim, idx + frag.length);
    }
  });

  return { htmlFrag: nodeHtml, newOffset: localCaret };
}

export const cleanHtmlInput = (html: string): string => {
  // Clean up the HTML from non-breaking spaces and zero-width spaces
  let processedText = html.replace(/&nbsp;/g, ' ').replace(/\u200b+/g, '');

  // Replace <br> tags with newlines (hanle <br*> and Safari <div><br></div>)
  const newlineRegex = new RegExp('<div><br></div>|<br[^>\\n]*>', 'g');
  processedText = processedText.replace(newlineRegex, '\n');

  // Replace Safari <div>*</div> with newlines
  const divRegex = new RegExp('<div>(.*?)</div>', 'g');
  processedText = processedText.replace(divRegex, '\n$1');

  return processedText;
}

/**
 * Main entry: take your DIV.innerHTML + old caret (flattened),
 * parse only the text‐node at that position, preserve other tags,
 * return new innerHTML + new flattened caret.
 */
export default function parseMarkdown(html: string, caret: number): ParseResult {
  // Clean up the HTML input
  html = cleanHtmlInput(html);

  // Delete all data-markdown attr from html ("**" or "__", etc. messing up parser)
  html = html.replace(/ data-markdown="[^"]*"/g, '');

  // handle code blocks globally
  const codeBlockRe = /```(\w*)\n([\s\S]*?)\n```/;
  const cbMatch = codeBlockRe.exec(html);
  if (cbMatch) {
    const [full, lang, code] = cbMatch;
    const idx = cbMatch.index;

    // build the exact same HTML structure your CodeBlock component uses
    const langPretty = getPrettyCodeLanguageName(lang);
    const title = langPretty ? `<p class="code-title" contentEditable="false">${langPretty}</p>` : '';
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

  // handle quote blocks globally
  const blockquoteRegex = /(?:^|\n)(?:&gt;|>) ([\s\S]{1,}?)(?=\n$)/g;

  const blockquoteMatch = blockquoteRegex.exec(html);
  if (blockquoteMatch) {
    const [full, content] = blockquoteMatch;
    const idx = blockquoteMatch.index;

    // build the exact same HTML structure your QuoteBlock component uses
    const replacement = `<blockquote data-can-collapse="false" class="blockquote">` + content +`</blockquote>`;

    // adjust caret if it was after the fenced block
    // todo

    html = html.slice(0, idx) + replacement + html.slice(idx + full.length);
  }

  // Process markdown in that node only
  const { htmlFrag: newHtml, newOffset } = processNodeText(html || '', caret);

  return { html: newHtml, caret: newOffset };
}