import { getActions } from "../../../global";
import { FC, useEffect, useState } from "../../../lib/teact/teact";
import React from "../../../lib/teact/teact";
import buildClassName from "../../../util/buildClassName";
import EmojiSearch from "../../common/pickers/EmojiSearch";
import StickerSearch from "../../right/StickerSearch";

type OwnProps = {
  stickersSearchMode: 'stickers' | 'emojis' | undefined;
  onClose: () => void;
}

const SymbolMenuSearchOverlay: FC<OwnProps> = ({
  stickersSearchMode,
  onClose,
}) => {
  const {
    setStickerSearchQuery
  } = getActions();

  const [searchQuery, setSearchQuery] = useState<string[]>([]);

  // Initializing the search query
  useEffect(() => {
    if (!!stickersSearchMode) {
      setStickerSearchQuery({ query: '' });
    }
  }, [stickersSearchMode]);

  // Search query change
  useEffect(() => {
    if (stickersSearchMode) {
      setStickerSearchQuery({ query: searchQuery[0] || '' });
    }
  }, [searchQuery]);

  return (
    <div
      className={buildClassName(
        'SymbolMenu-search-overlay',
        !stickersSearchMode && 'SymbolMenu-search-overlay-disabled'
      )}
    >
      {!!stickersSearchMode &&
        <>
          <EmojiSearch
            placeholderSuffix={stickersSearchMode === 'stickers' ? 'Stickers' : 'Emoji'}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchMode={!!stickersSearchMode}
            setSearchMode={mode => !mode && onClose()}
            hideOverlayButtons
          />
          { stickersSearchMode === 'stickers' ?
            // TODO: implement Load/Play handling with IntersectionObserver
            // StickerSearch currently is very heavy and slow
             <StickerSearch isActive /> :
             null // TODO: Implement StickerSeatch like for CustomEmojis
                  // There are already CustomEMojis Seets with "Add" button
                  // So need just component to list them and manage load/playing with IntersactionObserver
          }
        </>
      }
    </div>
  );
}

export default SymbolMenuSearchOverlay;
