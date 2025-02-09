import {
  ApiFormattedText,
  ApiMessageEntity,
  ApiMessageEntityTypes,
} from "../api/types";

type MarkdownTree = {
  text: string;
  children?: MarkdownTreeNode[];
}

type MarkdownTreeNode = {
  type: ApiMessageEntityTypes;
  start: number;
  end: number;
  children?: MarkdownTreeNode[];
  // language?: string; // For code blocks
}

type MarkdownTag = {
  type: ApiMessageEntityTypes;
  isMarkdown: boolean;
  start: number;
  end: number;
}

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
  '```': ApiMessageEntityTypes.Pre,
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

  // Clean up the HTML and convert markdown links to HTML links
  html = preprocessText(html, withMarkdownLinks);
  console.warn('html:', html);

  // AST Parser
  const tree = parseHtmlToTree(html, skipMarkdown);
  
  // Process the tree to create the formatted text for API

  return { text: '', entities: [] };
}

function preprocessText(html: string, withMarkdownLinks: boolean): string {
  let processedText = html.replace(/&nbsp;/g, ' ').trim().replace(/\u200b+/g, '');
  if (withMarkdownLinks) {
    // Handle markdown links
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }
  return processedText;
}

function parseHtmlToTree(html: string, skipMarkdown?: boolean): MarkdownTree | void {
  const parsedTree: MarkdownTree = { text: '' };

  function walk(text: string, tree: MarkdownTreeNode | MarkdownTree) {
    console.warn(`Starting walk with text: ${text}`);
    let currentIndex = 0;
    for(let i = 0; i < text.length; i++) {
      const slice = text.slice(currentIndex, i + 1);

      console.warn(`i: ${i}, currentIndex: ${currentIndex}, slice: ${slice}`);
      // Check if the slice is a markdown token
      const tag = findMarkdownTag(slice, currentIndex, skipMarkdown);
      if (tag) {
        console.warn('Tag found:', tag);

        // Handle text before the tag: add it to text and update currentIndex
        const textBefore = text.slice(currentIndex, tag.start);
        parsedTree.text += textBefore;
        console.warn(`Adding text before tag: ${textBefore}`);
        
        // Look for the closing tag in the remaining text
        const _slice = text.slice(tag.end);
        
        console.warn(`new slice: ${_slice}`);

        // If found tag, find the closing tag
        const closingTag = findMarkdownTag(_slice, tag.end, skipMarkdown, { isMarkdown: !!tag.isMarkdown, type: tag.type });

        if (closingTag) {
          // Handle text between the tags
          const textBetween = text.slice(tag.end, closingTag.start);
          
          console.warn('closingTag:', closingTag);
          console.warn('textBetween:', textBetween);

          // Create a new node
          const node: MarkdownTreeNode = {
            type: tag.type,
            start: parsedTree.text.length,
            end: parsedTree.text.length + textBetween.length,
          };
          console.warn('created node:', node);
          // Recursively walk the text between the tags
          walk(textBetween, node);

          // Add the node to the tree
          tree.children = [...(tree.children || []), node];

          // Update currentIndex and i
          currentIndex = closingTag.end;
          i = currentIndex - 1;
        } else {
          console.warn('No closing tag found');
          // If no closing tag found, add tag as text
          parsedTree.text += text.slice(tag.start, tag.end);
          currentIndex = tag.end;
        }
      } else {
        // If last slice, add it to text
        if (i === text.length - 1) {
          parsedTree.text += slice;
        }
      }
    }
    console.warn('parsedTree:', parsedTree.text);
  }

  walk(html, parsedTree);
  console.warn('parsedTree:', parsedTree);
  return parsedTree;
}

function findMarkdownTag(text: string, offset: number, skipMarkdown?: boolean, closeTag?: { isMarkdown: boolean, type: ApiMessageEntityTypes}): MarkdownTag | void {
  let tags = Object.entries(HTML_TAG_TO_ENTITY).map(arr => { return {tag: arr[0], type: arr[1], isMarkdown: false }});
  if (!skipMarkdown) {
    tags.push(...Object.entries(MARKDOWN_TAG_TO_ENTITY).map(arr => { return {tag: arr[0], type: arr[1], isMarkdown: true }}));
  }

  for (const item of tags) {
    const { tag, type, isMarkdown } = item;
    if (closeTag && type !== closeTag.type && isMarkdown !== closeTag.isMarkdown) continue;

    const regex = !isMarkdown ? new RegExp(!closeTag ? `<${tag}(?:\\s+[^>]*)?>` : `</${tag}>`, 'g') : new RegExp(escapeRegExp(tag), 'g');

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      return {
        type: type,
        start: offset + match.index,
        end: offset + match.index + match[0].length,
        isMarkdown: isMarkdown,
      };
    }
  }
}


// function parseHtmlToDom(html: string): Document {
//   const parser = new DOMParser();
//   return parser.parseFromString(html, 'text/html');
// }

// function tokenizeMarkdown(text: string): MarkdownToken[] {
//   const tokens: MarkdownToken[] = [];
//   const patterns = [
//     { regex: /\*\*(.*?)\*\*/g, type: ApiMessageEntityTypes.Bold },
//     { regex: /__(.*?)__/g, type: ApiMessageEntityTypes.Italic },
//     { regex: /~~(.*?)~~/g, type: ApiMessageEntityTypes.Strike},
//     { regex: /\|\|(.*?)\|\|/g, type: ApiMessageEntityTypes.Spoiler},
//     { regex: /```(.*?)(?:<br>|\n)([\s\S]*?)(?:<br>|\n)```/g, type: ApiMessageEntityTypes.Pre},
//     { regex: /`([^`]+)`/g, type: ApiMessageEntityTypes.Code },
//     // quotes ?
//     // 
//   ];

//   for (const { regex, type } of patterns) {
//     let match: RegExpExecArray | null;

//     while ((match = regex.exec(text)) !== null) {
//       console.warn('match:', match);
//       const markdownToken: MarkdownToken = {
//         type: type as MarkdownToken['type'],
//         start: match.index,
//         end: match.index + match[0].length,
//         content: '',
//       }

//       // Update content based on the type
//       if (type === ApiMessageEntityTypes.Pre) {
//         markdownToken.language = match[1] || undefined;
//         markdownToken.content = match[2] || '';
//       } else if (type === ApiMessageEntityTypes.Code) {
//         const matchIndex = match.index;
//         // Skip code blocks inside pre blocks
//         if (tokens.some(token => token.type === ApiMessageEntityTypes.Pre && token.start < matchIndex && token.end > matchIndex)) {
//           continue;
//         }
//         markdownToken.content = match[1];
//       } else {
//         markdownToken.content = match[1];
//       }

//       tokens.push(markdownToken);
//     }
//   }

//   // Sort tokens by start position to handle nested cases
//   tokens.sort((a, b) => a.start - b.start);

//   return tokens;
// }

// function convertDomToAst(dom: Document): { entities: ApiMessageEntityToken[]; textContent: string } {
//   const tokens: ApiMessageEntityToken[] = [];
//   let textContent = '';
//   let currentOffset = 0;

//   function walk(node: Node) {
//     if (node.nodeType === Node.TEXT_NODE) {
//       const nodeText = node.textContent || '';
//       textContent += nodeText;
//       currentOffset += nodeText.length;
//     } else if (node.nodeType === Node.ELEMENT_NODE) {
//       const element = node as HTMLElement;
//       const tagName = element.nodeName;
//       const entityType = HTML_TAG_TO_ENTITY[tagName] || ApiMessageEntityTypes.Unknown;

//       if (entityType === ApiMessageEntityTypes.Unknown) {
//         if (tagName === 'BR') {
//           textContent += '\n';
//           currentOffset++;
//         } else {
//           Array.from(element.childNodes).forEach(walk);
//         }
//       } else if (entityType === ApiMessageEntityTypes.CustomEmoji) {
//         const attributes = getElementAttributes(element, entityType);
//         const emojiText = (element as HTMLImageElement).alt || '';
//         textContent += emojiText;
//         const startOffset = currentOffset;
//         currentOffset += emojiText.length;
//         if (attributes.documentId) {
//           tokens.push({
//             type: entityType,
//             offset: startOffset,
//             content: emojiText,
//             length: emojiText.length,
//             attributes,
//           });
//         }
//       } else {
//         const startOffset = currentOffset;
//         const attributes = getElementAttributes(element, entityType);
//         Array.from(element.childNodes).forEach(walk);
//         const length = currentOffset - startOffset;
//         if (length > 0) {
//           tokens.push({
//             type: entityType,
//             offset: startOffset,
//             content: textContent.slice(startOffset, currentOffset),
//             length,
//             attributes,
//           });
//         }
//       }
//     }
//   }

//   Array.from(dom.body.childNodes).forEach(walk);

//   return {
//     entities: tokens.filter(token => token.type !== ApiMessageEntityTypes.Unknown && token.length > 0),
//     textContent,
//   };
// }

// function convertAstToFormattedText(entities: ApiMessageEntityToken[], textContent: string): ApiFormattedText {
//   return {
//     text: textContent.trim(),
//     entities: entities.length ? entities.map(createApiEntity) : undefined,
//   };
// }

// function getElementAttributes(element: HTMLElement, type: ApiMessageEntityTypes): Record<string, string> {
//   switch (type) {
//     case ApiMessageEntityTypes.TextUrl:
//       return { url: (element as HTMLAnchorElement).href };
//     case ApiMessageEntityTypes.CustomEmoji:
//       return { documentId: element.dataset.documentId || '' };
//     case ApiMessageEntityTypes.Pre:
//       return { language: element.dataset.language || '' };
//     case ApiMessageEntityTypes.MentionName:
//       return { userId: element.dataset.userId || '' };
//     case ApiMessageEntityTypes.Blockquote:
//       return { canCollapse: element.dataset.canCollapse || 'false' };
//     default:
//       return {};
//   }
// }

// function createApiEntity(token: ApiMessageEntityToken): ApiMessageEntity {
//   const baseEntity = { offset: token.offset, length: token.length };
//   switch (token.type) {
//     case ApiMessageEntityTypes.TextUrl:
//       return { ...baseEntity, type: ApiMessageEntityTypes.TextUrl, url: token.attributes?.url || '' };
//     case ApiMessageEntityTypes.CustomEmoji:
//       return { ...baseEntity, type: ApiMessageEntityTypes.CustomEmoji, documentId: token.attributes?.documentId || '' };
//     case ApiMessageEntityTypes.Pre:
//       return { ...baseEntity, type: ApiMessageEntityTypes.Pre, language: token.attributes?.language };
//     case ApiMessageEntityTypes.MentionName:
//       return { ...baseEntity, type: ApiMessageEntityTypes.MentionName, userId: token.attributes?.userId || '' };
//     case ApiMessageEntityTypes.Blockquote:
//       return { ...baseEntity, type: ApiMessageEntityTypes.Blockquote, canCollapse: token.attributes?.canCollapse === 'true' };
//     default:
//       return { ...baseEntity, type: token.type } as ApiMessageEntity;
//   }
// }
