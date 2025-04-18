import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useRef, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiVideo } from '../../../api/types';

import { SLIDE_TRANSITION_DURATION } from '../../../config';
import { selectCurrentMessageList, selectIsChatWithSelf } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';

import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useLastCallback from '../../../hooks/useLastCallback';
import useAsyncRendering from '../../right/hooks/useAsyncRendering';

import EmojiSearch from '../../common/pickers/EmojiSearch';
import GifSearch from '../../right/GifSearch';
import GifButton from '../../common/GifButton';
import Loading from '../../ui/Loading';

import './GifPicker.scss';

type OwnProps = {
  className: string;
  loadAndPlay: boolean;
  canSendGifs?: boolean;
  onGifSelect?: (gif: ApiVideo, isSilent?: boolean, shouldSchedule?: boolean) => void;
};

type StateProps = {
  savedGifs?: ApiVideo[];
  isSavedMessages?: boolean;
};

const INTERSECTION_DEBOUNCE = 300;

const GifPicker: FC<OwnProps & StateProps> = ({
  className,
  loadAndPlay,
  canSendGifs,
  savedGifs,
  isSavedMessages,
  onGifSelect,
}) => {
  const {
    setGifSearchQuery,
    loadSavedGifs,
    saveGif
  } = getActions();

  const handleUnsaveClick = useLastCallback((gif: ApiVideo) => {
    saveGif({ gif, shouldUnsave: true });
  });

  const canRenderContents = useAsyncRendering([], SLIDE_TRANSITION_DURATION);

  /**
   * Search functionality
   */
  const [searchQuery, setSearchQuery] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState(false);

  // Send Empty query to upload 'Popular' gifs on searchMode On
  useEffect(() => {
    if (searchMode) {
      setGifSearchQuery({ query: '' });
    }
  }, [searchMode, setGifSearchQuery]);

  // Send query to upload gifs on searchg input change
  useEffect(() => {
    setGifSearchQuery({ query: searchQuery.length ? searchQuery[0] : '' });
  }, [searchQuery, setGifSearchQuery]);

  // Load saved gifs on mount or searchMode change
  useEffect(() => {
    if (loadAndPlay && !searchMode) {
      loadSavedGifs();
    }
  }, [loadAndPlay, loadSavedGifs, searchMode]);

  return (
    <div className={buildClassName('GifPicker', className)}>
      {canSendGifs && (
        <EmojiSearch
          className="GifPicker-search"
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchMode={searchMode}
          setSearchMode={setSearchMode}
          placeholderSuffix={'GIFs'}
        />)
      }
      {searchMode ? (
        <GifSearch onClose={() => setSearchMode(false)} isActive={searchMode} />
      ) : !canSendGifs ? (
        <div className="picker-disabled">Sending GIFs is not allowed in this chat.</div>
      ) : canRenderContents && savedGifs && savedGifs.length ? (
        <GifList
          key={String(searchMode)}
          className={className}
          savedGifs={savedGifs}
          onGifSelect={onGifSelect}
          onUnsaveClick={handleUnsaveClick}
          isSavedMessages={isSavedMessages}
          loadAndPlay={loadAndPlay}
        />
      ) : canRenderContents && savedGifs ? (
        <div className="picker-disabled">No saved GIFs.</div>
      ) : (
        <Loading />
      )}
    </div>
  );
}

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const { chatId } = selectCurrentMessageList(global) || {};
    const isSavedMessages = Boolean(chatId) && selectIsChatWithSelf(global, chatId);
    return {
      savedGifs: global.gifs.saved.gifs,
      isSavedMessages,
    };
  },
)(GifPicker));

// Workaround for the issue with the intersection observer
// not being triggered when the element is remounted
// TODO: create and use one component for both GifPicker and GifSearch
const GifList: FC<{
  savedGifs: ApiVideo[];
  onGifSelect?: (gif: ApiVideo) => void;
  onUnsaveClick?: (gif: ApiVideo) => void;
  isSavedMessages: boolean | undefined;
  loadAndPlay: boolean;
  className: string;
}> = ({
  savedGifs,
  onGifSelect,
  onUnsaveClick,
  isSavedMessages,
  loadAndPlay,
  className,
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { observe } = useIntersectionObserver({
      rootRef: scrollContainerRef,
      debounceMs: INTERSECTION_DEBOUNCE,
    });

    return (
      <div
        ref={scrollContainerRef}
        className={buildClassName('GifPicker-saved', className, IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll')}
      >
        {savedGifs.map(gif => (
          <GifButton
            key={gif.id}
            gif={gif}
            observeIntersection={observe}
            isDisabled={!loadAndPlay}
            onClick={onGifSelect}
            onUnsaveClick={onUnsaveClick}
            isSavedMessages={isSavedMessages}
          />
        ))}
      </div>
    );
  };