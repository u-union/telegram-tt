import {
  ApiFormattedText,
  ApiMessageEntity,
  ApiMessageEntityTypes,
} from "../api/types";

type MarkupToken = {
  type: ApiMessageEntityTypes | 'text';
  isCloseTag?: boolean;
  text: string
}

type MarkupTag = {
  regex: RegExp;
  type: ApiMessageEntityTypes;
  isMarkdown: boolean;
  isCloseTag?: boolean;
}

type MarkupTree = {
  text: string;
  children?: MarkupTreeNode[];
}

type MarkupTreeNode = {
  type: ApiMessageEntityTypes;
  start: number;
  end: number;
  children?: MarkupTreeNode[];
  url?: string;
  language?: string;
  documentId?: string;
  canCollapse?: string;
}

const MAX_REGRESSION_DEPTH = 50;

const HTML_TAG_TO_ENTITY: Record<string, ApiMessageEntityTypes> = {
  'b': ApiMessageEntityTypes.Bold,
  'strong': ApiMessageEntityTypes.Bold,
  'i': ApiMessageEntityTypes.Italic,
  'em': ApiMessageEntityTypes.Italic,
  'u': ApiMessageEntityTypes.Underline,
  'ins': ApiMessageEntityTypes.Underline,
  's': ApiMessageEntityTypes.Strike,
  'strike': ApiMessageEntityTypes.Strike,
  'del': ApiMessageEntityTypes.Strike,
  'code': ApiMessageEntityTypes.Code,
  'pre': ApiMessageEntityTypes.Pre,
  'blockquote': ApiMessageEntityTypes.Blockquote,
  'a': ApiMessageEntityTypes.TextUrl,
  'img': ApiMessageEntityTypes.CustomEmoji,
  'span': ApiMessageEntityTypes.Spoiler,
};

const MARKDOWN_TAG_TO_ENTITY: Record<string, ApiMessageEntityTypes> = {
  '**': ApiMessageEntityTypes.Bold,
  '__': ApiMessageEntityTypes.Italic,
  '~~': ApiMessageEntityTypes.Strike,
  '||': ApiMessageEntityTypes.Spoiler,
  // '```': ApiMessageEntityTypes.Pre, // Processed before, convert to HTML
  '`': ApiMessageEntityTypes.Code,
};

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function parseHtmlAsFormattedTextNew(
  html: string,
  withMarkdownLinks = false,
  skipMarkdown = false
): ApiFormattedText {  
  console.warn('--------------------------------------------');
  console.warn('html:', html);

  // Clean up the HTML and convert markdown links to HTML links
  html = preprocessText(html, withMarkdownLinks);
  console.warn('processedhtml:', html);

  // HTML -> Tokenize -> Tree
  const tree = parseHtmlToTree(html, skipMarkdown);
  console.warn('tree:', tree);
  // Process the tree to create the formatted text for API
  const formattedText = convertTreeToFormattedText(tree);
  console.warn('formattedText:', formattedText);

  return formattedText;
}

function preprocessText(html: string, withMarkdownLinks: boolean): string {
  // Clean up the HTML from non-breaking spaces and zero-width spaces
  let processedText = html.replace(/&nbsp;/g, ' ').trim().replace(/\u200b+/g, '');

  // Replace <br> tags with newlines (hanle <br*> and Safari <div><br></div>)
  const newlineRegex = new RegExp('<div><br></div>|<br[^>\\n]*>', 'g');
  processedText = processedText.replace(newlineRegex, '\n');

  // Replace Safari <div>*</div> with newlines
  const divRegex = new RegExp('<div>(.*?)</div>', 'g');
  processedText = processedText.replace(divRegex, '\n$1');

  // Are emojii supported / custom emojii - regex

  // Replace '```' with '<pre>'
  const preRegex = new RegExp('(?:^|\\n)```(.*?)(?:\\n)([\\s\\S]*?)(?:\\n)```(?=\\n|$)', 'gms');
  processedText = processedText.replace(preRegex, '<pre data-language="$1">$2</pre>');

  // Replace '\n *spacing allowed* > *everything* \n' with '<blockquote>'
  const blockquoteRegex = new RegExp('(?:^|\\n)(&gt;|>) ([\\s\\S]*?)(?=\\n|$)', 'g');
  processedText = processedText.replace(blockquoteRegex, '<blockquote data-can-collapse="false">$1</blockquote>\n');

  if (withMarkdownLinks) {
    // Handle markdown links
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }
  return processedText;
}

function parseHtmlToTree(html: string, skipMarkdown?: boolean): MarkupTree {
  // Tokenize the text (create an array of markup tokens)
  const markupTokens: MarkupToken[] = tokenizeMarkdown(html, skipMarkdown);

  console.warn('markupTokens:', markupTokens);

  function walk(tokens: MarkupToken[], regression_depth = 0): MarkupTreeNode[] {
    const nodes: MarkupTreeNode[] = [];

    // Prevent infinite recursion
    if (regression_depth > MAX_REGRESSION_DEPTH) {
      console.warn('Max regression depth reached');
      parsedTree.text += tokens.map(token => getCleanStringFromHtmlText(token.text)).join('');
      return nodes;
    }

    console.warn(`Reg_depth: ${regression_depth}. Starting walk with text: `, tokens);

    for(let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // Save the start index of the tag in the text
      const tagStartIndex = parsedTree.text.length;
      console.warn(`Processing token: `, token);

      // If it's a text token, add it to the text
      // Also, if it's a close tag (before the open tag), add it to the text
      if (token.type === 'text' || token.isCloseTag) {
        parsedTree.text += getCleanStringFromHtmlText(token.text);
        continue;
      } else if (token.type === ApiMessageEntityTypes.CustomEmoji) {
        // Handle custom emoji
        const imgElement = parseHtmlToDom(token.text) as HTMLImageElement;
        parsedTree.text += imgElement.alt || '';
        const attributes = getElementAttributes(imgElement, token.type);
        if (attributes.documentId) {
          nodes.push({
            type: token.type,
            start: tagStartIndex,
            end: parsedTree.text.length,
            documentId: attributes.documentId,
          });
        }
        continue;
      }

      // Find the corresponding close tag
      const closeTagIndex = tokens
        .findIndex((t, index) => {
          return t.type === token.type
            && t.isCloseTag === (token.isCloseTag === undefined ? undefined : true)
            && index > i;
        });

      if (closeTagIndex === -1) {
        console.warn('Close tag not found');
        parsedTree.text += getCleanStringFromHtmlText(token.text);
        continue;
      }
      const closeTag = tokens[closeTagIndex];
      console.warn('Close tag found:', closeTag);

      // Get attributes if needed
      const attributes: Record<string, string> = {};
      if (token.type === ApiMessageEntityTypes.Pre) {
        // Get language for pre tag
        const preElement = parseHtmlToDom(token.text) as HTMLElement;
        Object.assign(attributes, getElementAttributes(preElement, token.type));
      } else if (token.type === ApiMessageEntityTypes.TextUrl) {
        // Get URL for a tag
        const aElement = parseHtmlToDom(token.text) as HTMLAnchorElement;
        Object.assign(attributes, getElementAttributes(aElement, token.type));
      }  else if (token.type === ApiMessageEntityTypes.Blockquote) {
        // Get canCollapse for blockquote tag
        const blockquoteElement = parseHtmlToDom(token.text) as HTMLElement;
        Object.assign(attributes, getElementAttributes(blockquoteElement, token.type));
      } else if (token.type === ApiMessageEntityTypes.MentionName) {
        // Get userId for span tag
        const spanElement = parseHtmlToDom(token.text) as HTMLElement;
        Object.assign(attributes, getElementAttributes(spanElement, token.type));
      }

      // Go through the tokens between the open and close tag
      const childrenTokens = tokens.slice(i + 1, closeTagIndex);
      const children = walk(childrenTokens, regression_depth + 1);

      // Add the node to the nodes array
      nodes.push({
        type: token.type,
        start: tagStartIndex,
        end: parsedTree.text.length,
        children: children.length ? children : undefined,
        ...attributes
      });

      // Move the index to the close tag
      i = closeTagIndex;
    }

    return nodes;
  }

  const parsedTree: MarkupTree = { text: '' };
  parsedTree.children = walk(markupTokens);

  // Check for blockquotes that are multiline
  parsedTree.children = checkForMultilineBlockquotes(parsedTree.children);

  return parsedTree;
}

function convertTreeToFormattedText(tree: MarkupTree): ApiFormattedText {
  function walk(node: MarkupTreeNode): ApiMessageEntity[] {
    const entities: ApiMessageEntity[] = [];
    // Create the entity for the current node
    const entity: ApiMessageEntity = {
      type: node.type,
      offset: node.start,
      length: node.end - node.start,
      language: node.language || undefined,
      documentId: node.documentId || undefined,
      url: node.url || undefined,
      canCollapse: node.canCollapse ? node.canCollapse === 'true' : undefined,
    };
    entities.push(entity);

    // Uncomment and adjust if processing children is needed
    if (node.children) {
      const childrenEntities = node.children.map(walk);
      entities.push(...childrenEntities.flat());
    }

    return entities;
  }

  // Process all top-level nodes in the tree if any
  const res = tree.children ? tree.children.map(walk).flat() : undefined;
  return { text: tree.text, entities: res || [] };
}

function tokenizeMarkdown(html: string, skipMarkdown?: boolean): MarkupToken[] {
  // Tokenize the text
  const markupTokens: MarkupToken[] = [];

  let currentSliceStartIndex = 0;
  for (let i = 0; i < html.length; i++) {
    const slice = html.slice(currentSliceStartIndex, i + 1);
    console.warn(`i: ${i}, currentSliceStartIndex: ${currentSliceStartIndex}, slice: ${slice}`);

    // Check if the slice is a markdown token
    const tag = findMarkdownTag(slice, skipMarkdown);
    if (tag) {
      console.warn('Tag found:', tag);
      const tagStartIndex = slice.length - tag.text.length;
      // Text before the tag - add as text token
      const textBefore = html.slice(currentSliceStartIndex, currentSliceStartIndex + tagStartIndex);
      if (textBefore) {
        markupTokens.push({ type: 'text', text: textBefore });
        console.warn(`Adding text before tag: ${textBefore}`);
      }

      // Add the tag token to the array
      markupTokens.push({ type: tag.type, text: tag.text, isCloseTag: tag.isCloseTag });
      console.warn('Adding tag:', tag.text);
      currentSliceStartIndex = i + 1;
      console.warn('new currentSliceStartIndex:', currentSliceStartIndex);
    } else {
      // If last slice, add it to text
      if (i === html.length - 1) {
        markupTokens.push({ type: 'text', text: slice });
        console.warn('Adding last slice:', slice);
      }
    }
  }

  // Find text first and trim(delete spaces) it from start, then last and trim it from end
  const arrayCopy = [...markupTokens];
  let textStartIndex = 0;
  let textEndIndex = arrayCopy.length - 1;
  while (arrayCopy[textStartIndex].type !== 'text') {
    textStartIndex++;
  }
  while (arrayCopy[textEndIndex].type !== 'text') {
    textEndIndex--;
  }
  arrayCopy[textStartIndex].text = arrayCopy[textStartIndex].text.trimStart();
  arrayCopy[textEndIndex].text = arrayCopy[textEndIndex].text.trimEnd();

  return markupTokens;
}

function findMarkdownTag(text: string, skipMarkdown?: boolean): MarkupToken | undefined {
  // Create an array of markup tags regexps
  const markupTagsDict: MarkupTag[] = [];
  Object.entries(HTML_TAG_TO_ENTITY).forEach(arr => {
    const [tag, type] = arr;

    const openTag = new RegExp(`<${tag}(?:\\s+[^>]*)?>`, 'g');
    const closeTag = new RegExp(`</${tag}>`, 'g');
    
    markupTagsDict.push({ regex: openTag, type, isCloseTag: false, isMarkdown: false });
    markupTagsDict.push({ regex: closeTag, type, isCloseTag: true, isMarkdown: false });
  });

  if (!skipMarkdown) {
    Object.entries(MARKDOWN_TAG_TO_ENTITY).forEach(arr => {
      const [tag, type] = arr;
      const markdownTag = new RegExp(escapeRegExp(tag), 'g');
      markupTagsDict.push({ regex: markdownTag, type, isMarkdown: true});
    });
  }

  for (const item of markupTagsDict) {
    const { regex, type, isCloseTag } = item;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      return {
        type: type,
        text: match[0],
        isCloseTag: isCloseTag,
      };
    }
  }
}

function parseHtmlToDom(html: string): HTMLElement {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html').body.firstChild as HTMLElement;
}

function getCleanStringFromHtmlText(html: string): string {
  const fragment = document.createElement('div');
  fragment.innerHTML = html;
  return fragment.innerText.replace(/\u200b+/g, '');
}

function getElementAttributes(element: HTMLElement, type: ApiMessageEntityTypes): Record<string, string> {
  switch (type) {
    case ApiMessageEntityTypes.TextUrl:
      return { url: (element as HTMLAnchorElement).href };
    case ApiMessageEntityTypes.CustomEmoji:
      return { documentId: element.dataset.documentId || '' };
    case ApiMessageEntityTypes.Pre:
      return { language: element.dataset.language || '' };
    case ApiMessageEntityTypes.MentionName:
      return { userId: element.dataset.userId || '' };
    case ApiMessageEntityTypes.Blockquote:
      return { canCollapse: element.dataset.canCollapse || 'false' };
    default:
      return {};
  }
}

function checkForMultilineBlockquotes(children: MarkupTreeNode[]): MarkupTreeNode[] {
  if (!children) {
    return children;
  }
  
  // Check if the tree has blockquotes only on the top level
  const newChildren: MarkupTreeNode[] = [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].type === ApiMessageEntityTypes.Blockquote) {
      const quoteStart = children[i].start;
      let quoteEnd = children[i].end;
      let quoteChildren = children[i].children || [];

      // check next childrens until the next non-blockquote
      let j = i + 1;
      while (
          j < children.length &&
          children[j].type === ApiMessageEntityTypes.Blockquote &&
          children[j].start === children[j - 1].end + 1
        ) {
        quoteEnd = children[j].end;
        quoteChildren = quoteChildren.concat(children[j].children || []);
        j++;
      }

      newChildren.push({
        type: ApiMessageEntityTypes.Blockquote,
        start: quoteStart,
        end: quoteEnd,
        children: quoteChildren,
        canCollapse: children[i].canCollapse,
      });

      i = j - 1;
    } else {
      newChildren.push(children[i]);
    }
  }

  return newChildren;
}
