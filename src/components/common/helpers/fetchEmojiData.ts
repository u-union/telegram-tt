
import type { EmojiData, EmojiModule, EmojiRawData } from '../../../util/emoji/emoji';
import { uncompressEmoji } from '../../../util/emoji/emoji';

let cachedDataPromise: Promise<EmojiData> | null = null;

/**
 * Loading and uncompresings emoji data
 * Caches the result for future calls
 */
export async function fetchEmojiData(): Promise<EmojiData> {
  if (cachedDataPromise) {
    return cachedDataPromise;
  }

  cachedDataPromise = import('emoji-data-ios/emoji-data.json')
    .then((jsonModule: EmojiModule) => {
      const emojiRawData: EmojiRawData = jsonModule.default;
      return uncompressEmoji(emojiRawData);
    });

  return cachedDataPromise;
}