import {
  ApiFormattedText,
  ApiMessageEntity,
  ApiMessageEntityTypes,
} from "../api/types";

interface Token {
  type: ApiMessageEntityTypes;
  offset: number;
  content?: string;
  length: number;
  attributes?: Record<string, string>;
}

const HTML_TAG_TO_ENTITY: Record<string, ApiMessageEntityTypes> = {
  B: ApiMessageEntityTypes.Bold,
  STRONG: ApiMessageEntityTypes.Bold,
  I: ApiMessageEntityTypes.Italic,
  EM: ApiMessageEntityTypes.Italic,
  U: ApiMessageEntityTypes.Underline,
  INS: ApiMessageEntityTypes.Underline,
  S: ApiMessageEntityTypes.Strike,
  STRIKE: ApiMessageEntityTypes.Strike,
  DEL: ApiMessageEntityTypes.Strike,
  CODE: ApiMessageEntityTypes.Code,
  PRE: ApiMessageEntityTypes.Pre,
  BLOCKQUOTE: ApiMessageEntityTypes.Blockquote,
  A: ApiMessageEntityTypes.TextUrl,
  IMG: ApiMessageEntityTypes.CustomEmoji,
  SPAN: ApiMessageEntityTypes.Spoiler,
};

export default function parseHtmlAsFormattedTextNew(
  html: string,
  withMarkdownLinks = false,
  skipMarkdown = false
): ApiFormattedText {
  // Idea here:
  // Tokenizer -> Parser -> AST -> Formatter (API entities)
  
  console.warn('--------------------------------------------');
  console.warn('html:', html);

  const cleanedHtml = preprocessText(html, withMarkdownLinks, skipMarkdown);
  const dom = parseHtmlToDom(cleanedHtml);
  console.warn('dom:', dom);

  const { entities, textContent } = convertDomToAst(dom);
  console.warn('textContent:', textContent);
  console.warn('entities:', entities);

  const formatted = convertAstToFormattedText(entities, textContent);
  console.warn('res:', formatted.text);

  return formatted;
}

function preprocessText(html: string, withMarkdownLinks: boolean, skipMarkdown: boolean): string {
  let processedText = html.replace(/&nbsp;/g, ' ').trim().replace(/\u200b+/g, '');
  if (!skipMarkdown) {
    // Placeholder for additional markdown processing if needed.
  }
  if (withMarkdownLinks) {
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }
  return processedText;
}

function parseHtmlToDom(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function convertDomToAst(dom: Document): { entities: Token[]; textContent: string } {
  const tokens: Token[] = [];
  let textContent = '';
  let currentOffset = 0;

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.textContent || '';
      textContent += nodeText;
      currentOffset += nodeText.length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.nodeName;
      const entityType = HTML_TAG_TO_ENTITY[tagName] || ApiMessageEntityTypes.Unknown;

      if (entityType === ApiMessageEntityTypes.Unknown) {
        if (tagName === 'BR') {
          textContent += '\n';
          currentOffset++;
        } else {
          Array.from(element.childNodes).forEach(walk);
        }
      } else if (entityType === ApiMessageEntityTypes.CustomEmoji) {
        const attributes = getElementAttributes(element, entityType);
        const emojiText = (element as HTMLImageElement).alt || '';
        textContent += emojiText;
        const startOffset = currentOffset;
        currentOffset += emojiText.length;
        if (attributes.documentId) {
          tokens.push({
            type: entityType,
            offset: startOffset,
            content: emojiText,
            length: emojiText.length,
          });
        }
      } else {
        const startOffset = currentOffset;
        const attributes = getElementAttributes(element, entityType);
        Array.from(element.childNodes).forEach(walk);
        const length = currentOffset - startOffset;
        if (length > 0) {
          tokens.push({
            type: entityType,
            offset: startOffset,
            content: textContent.slice(startOffset, currentOffset),
            length,
            attributes,
          });
        }
      }
    }
  }

  Array.from(dom.body.childNodes).forEach(walk);

  return {
    entities: tokens.filter(token => token.type !== ApiMessageEntityTypes.Unknown && token.length > 0),
    textContent,
  };
}

function convertAstToFormattedText(entities: Token[], textContent: string): ApiFormattedText {
  return {
    text: textContent.trim(),
    entities: entities.length ? entities.map(createApiEntity) : undefined,
  };
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

function createApiEntity(token: Token): ApiMessageEntity {
  const baseEntity = { offset: token.offset, length: token.length };
  switch (token.type) {
    case ApiMessageEntityTypes.TextUrl:
      return { ...baseEntity, type: ApiMessageEntityTypes.TextUrl, url: token.attributes?.url || '' };
    case ApiMessageEntityTypes.CustomEmoji:
      return { ...baseEntity, type: ApiMessageEntityTypes.CustomEmoji, documentId: token.attributes?.documentId || '' };
    case ApiMessageEntityTypes.Pre:
      return { ...baseEntity, type: ApiMessageEntityTypes.Pre, language: token.attributes?.language };
    case ApiMessageEntityTypes.MentionName:
      return { ...baseEntity, type: ApiMessageEntityTypes.MentionName, userId: token.attributes?.userId || '' };
    case ApiMessageEntityTypes.Blockquote:
      return { ...baseEntity, type: ApiMessageEntityTypes.Blockquote, canCollapse: token.attributes?.canCollapse === 'true' };
    default:
      return { ...baseEntity, type: token.type } as ApiMessageEntity;
  }
}
