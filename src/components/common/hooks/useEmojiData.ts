
import { useEffect, useState } from '../../../lib/teact/teact';
import type { EmojiData } from '../../../util/emoji/emoji';
import { fetchEmojiData } from '../helpers/fetchEmojiData';

/**
 * Hook to use fetched emoji data.
 */
export default function useEmojiData(): EmojiData | null {
  const [emojiData, setEmojiData] = useState<EmojiData | null>(null);

  useEffect(() => {
    let isCanceled = false;

    (async () => {
      const data = await fetchEmojiData();
      if (!isCanceled) {
        setEmojiData(data);
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, []);

  return emojiData;
}