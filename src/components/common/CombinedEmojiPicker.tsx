import type { FC } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import { withGlobal } from '../../global';
import { selectIsChatWithSelf, selectIsCurrentUserPremium } from '../../global/selectors';

import type { ApiSticker } from '../../api/types';
import type { IconName } from '../../types/icons';
import { StickerSetOrReactionsSetOrRecent } from '../../types';

import {
  MENU_TRANSITION_DURATION,
  POPULAR_SYMBOL_SET_ID,
  RECENT_SYMBOL_SET_ID,
  SLIDE_TRANSITION_DURATION,
} from '../../config';
import { REM } from './helpers/mediaDimensions';
import { IS_TOUCH_ENV } from '../../util/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { pickTruthy } from '../../util/iteratees';

import useAppLayout from '../../hooks/useAppLayout';
import useAsyncRendering from '../right/hooks/useAsyncRendering';
import useCenterActiveElementHorizontally from './hooks/useCenterActiveElementHorizontally';
import useEmojiData from './hooks/useEmojiData';
import useHorizontalScroll from '../../hooks/useHorizontalScroll';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import usePrevDuringAnimation from '../../hooks/usePrevDuringAnimation';
import useScrolledState from '../../hooks/useScrolledState';
import useDerivedState from '../../hooks/useDerivedState';
import { useStickerPickerObservers } from './hooks/useStickerPickerObservers';

import Button from '../ui/Button';
import Icon from './icons/Icon';
import Loading from '../ui/Loading';
import StickerButton from './StickerButton';
import StickerSet from './StickerSet';
import EmojiSearch from './EmojiSearch';
import HorizontalTabSelector from '../ui/HorizontalTabSelector';
import EmojiCategory from '../middle/composer/EmojiCategory';

import './CombinedEmojiPicker.scss';
import pickerStyles from '../middle/composer/StickerPicker.module.scss';


type OwnProps = {
  chatId?: string;
  className?: string;
  idPrefix?: string;
  isHidden?: boolean;
  loadAndPlay: boolean;
  onEmojiSelect: (emoji: string, name: string) => void;
  onCustomEmojiSelect?: (sticker: ApiSticker) => void;
};

type StateProps = {
  recentCustomEmojiIds?: string[];
  customEmojisById?: Record<string, ApiSticker>;
  addedCustomEmojiIds?: string[];
  stickerSetsById?: Record<string, StickerSetOrReactionsSetOrRecent>;
  isCurrentUserPremium?: boolean;
  isSavedMessages?: boolean;
  chatEmojiSetId?: string;
};

type EmojiCategoryemojiData = {
  id: string;
  type: 'recent' | 'emoji' | 'custom';
  name?: string;
  emojis: string[] | ApiSticker[];
};

const ICONS_BY_CATEGORY: Record<string, IconName> = {
  recent: 'recent',
  people: 'smile',
  nature: 'animals',
  foods: 'eats',
  activity: 'sport',
  places: 'car',
  objects: 'lamp',
  symbols: 'language',
  flags: 'flag',
};

const EMOJI_PICKER_ID = 'emoji-picker';
const FOCUS_MARGIN = 3.25 * REM;
const HEADER_CUSTOM_EMOJI_BUTTON_SIZE = 1.75 * REM;

const CombinedEmojiPicker: FC<OwnProps & StateProps> = ({
  className,
  idPrefix,
  recentCustomEmojiIds,
  customEmojisById,
  addedCustomEmojiIds,
  stickerSetsById,
  isCurrentUserPremium,
  isSavedMessages,
  loadAndPlay,
  isHidden,
  onEmojiSelect,
  onCustomEmojiSelect,
}) => {
  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const headerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const sharedCanvasRef = useRef<HTMLCanvasElement>(null);

  const [emojis, setEmojis] = useState<AllEmojis>();
  const [emojiCategories, setEmojiCategories] = useState<EmojiCategoryemojiData[]>();

  // For search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);

  const EMOJI_CATEGORY_SELECTOR_ID = `${idPrefix}-emoji-category`;

  const { isMobile } = useAppLayout();
  const {
    handleScroll: handleContentScroll,
    isAtBeginning: shouldHideTopBorder,
  } = useScrolledState();

  const canLoadAndPlay = usePrevDuringAnimation(loadAndPlay || undefined, SLIDE_TRANSITION_DURATION);

  const lang = useLang();

  const {
    activeSetIndex: activeCategoryIndex,
    observeIntersectionForSet,
    observeIntersectionForPlayingItems,
    observeIntersectionForShowingItems,
    observeIntersectionForCovers,
    selectStickerSet: setActiveCategoryIndex
  } = useStickerPickerObservers(containerRef, headerRef, EMOJI_CATEGORY_SELECTOR_ID, isHidden, FOCUS_MARGIN);

  const canRenderContents = useAsyncRendering([], MENU_TRANSITION_DURATION);
  const shouldRenderContent = emojis && canRenderContents;

  // Scroll header horizontally on vertical scroll as well
  useHorizontalScroll(headerRef, isMobile || !shouldRenderContent);

  // Center the active element horizontally
  useCenterActiveElementHorizontally(headerRef, EMOJI_PICKER_ID, activeCategoryIndex);

  const allCategories: EmojiCategoryemojiData[] = useMemo(() => {
    const combined: EmojiCategoryemojiData[] = [];

    // Add recent (only custom)
    combined.push({
      id: RECENT_SYMBOL_SET_ID,
      name: lang('RecentStickers'),
      type: 'recent',
      emojis: Object.values(pickTruthy(customEmojisById!, recentCustomEmojiIds || [])),
    });

    // Add standard emoji categories
    if (emojiCategories) {
      combined.push(...emojiCategories);
    }

    // Add custom emoji sets
    if (addedCustomEmojiIds && stickerSetsById) {
      addedCustomEmojiIds.forEach((setId) => {
        const set = stickerSetsById[setId];
        if (set && set.stickers?.length && !combined.find((category) => category.id === set.id)) {
          combined.push({
            id: set.id,
            name: set.title,
            emojis: set.stickers,
            type: 'custom',
          });
        }
      });
    }

    return combined;
  }, [emojiCategories, recentCustomEmojiIds, addedCustomEmojiIds, stickerSetsById, lang]);

  /**
   * Search results for emojis
   */
  const searchResults: EmojiCategoryemojiData[] = useDerivedState(() => {
    if (!searchQuery) {
      return [];
    }

    // Find emojis that match the search query
    const searchQueryLower = searchQuery.toLowerCase();
    const emojiResults = Object.entries(emojis || {})
      .map(([_, emoji]) => {
        const filteredEmoji = 'id' in emoji ? emoji : emoji[1];
        return filteredEmoji.names
          .some((name) => name.includes(searchQueryLower)) ?
          filteredEmoji : null;
      })
      .filter(Boolean);

    // Find custom emojis that match emojis 
    // Currently, there is no names or so for custom emojis
    // So just show custom emojis that has same emoji with found static emojis

    // Used added only example
    // const customEmojisResults = (addedCustomEmojiIds || [])
    //   .map((setId) => stickerSetsById?.[setId]?.stickers)
    //   .flat()
    //   .filter((sticker) => {
    //     if (sticker?.emoji) {
    //       return emojiResults.some((emoji) => emoji.native === sticker.emoji);
    //     }
    //     return false;
    //   })
    //   .filter(Boolean);

    // Use all custom emojis
    const customEmojisResults = Object.values(customEmojisById || {})
      .filter((sticker) => {
        if (sticker?.emoji) {
          return emojiResults.some((emoji) => emoji.native === sticker.emoji);
        }
        return false;
      });


    console.warn('customEmojisResults', customEmojisResults.length);
    // Combine results with added custom emojis
    return [
      {
        id: 'emoji',
        type: 'emoji',
        emojis: emojiResults.map(e => e.id),
      },
      {
        id: 'custom',
        type: 'custom',
        emojis: customEmojisResults,
      }
    ];
  }, [emojis, searchQuery, stickerSetsById]);

  /**
   * Get the emojis from the emoji emojiData
   */
  const emojiData = useEmojiData();
  useEffect(() => {
    if (!emojiData) return;

    setEmojiCategories(emojiData.categories.map((category) => ({
      ...category,
      type: 'emoji',
    })));

    setEmojis(emojiData.emojis as AllEmojis);
  }, [emojiData]);

  const selectCategory = useLastCallback((index: number) => {
    setActiveCategoryIndex(index);
  });

  const handleEmojiSelect = useLastCallback((emoji: string, name: string) => {
    onEmojiSelect(emoji, name);
  });

  function renderCategoryButton(category: EmojiCategoryemojiData, index: number) {
    // Don't render the button if there are no emojis
    if (!category?.emojis?.length) {
      return null;
    }

    // Check if the category is custom and get icons
    const isCustom = category.type === 'custom';

    const buttonClassName = buildClassName(
      'symbol-set-button',
      index === activeCategoryIndex && 'activated',
      isCustom && pickerStyles.stickerCover,
    );

    if (isCustom) {
      // const firstSticker = (category.emojis as ApiSticker[])[Math.round(Math.random() * category.emojis.length)];
      const firstSticker = (category.emojis as ApiSticker[])[0];

      return (
        <div id={`${EMOJI_PICKER_ID}-${index}`} className="sticker-cover" >
          <StickerButton
            key={category.id}
            title={category.name}
            className={buttonClassName}
            sticker={firstSticker}
            size={HEADER_CUSTOM_EMOJI_BUTTON_SIZE}
            noPlay={!canLoadAndPlay}
            forcePlayback
            observeIntersection={observeIntersectionForCovers}
            noContextMenu
            clickArg={index}
            sharedCanvasRef={sharedCanvasRef}
            isSavedMessages={isSavedMessages}
            onClick={() => selectCategory(index)}
          />

          {/* Kind of workaround to highlight
        the active custom-emoji category
        as StickerButton is not perfectly aligned
        with animation on shared canvas
        (animation is slightly on the left
        from center of the button) */}
          <div className={
            buildClassName(
              'sticker-active-indicator',
              index === activeCategoryIndex && 'activated',
            )}
          />
        </div>)
    } else {
      const icon = isCustom ? undefined : ICONS_BY_CATEGORY[category.id];
      return (
        <Button
          id={`${EMOJI_PICKER_ID}-${index}`}
          className={buttonClassName}
          round
          faded
          color="translucent"
          onClick={() => selectCategory(index)}
          ariaLabel={category.name}
        >
          {icon && <Icon name={icon} />}
        </Button>
      )
    }
  }

  const containerClassName = buildClassName(
    'EmojiPicker',
    className,
    searchMode && 'search-focused',
  );

  if (!shouldRenderContent) {
    return (
      <div className={containerClassName}>
        <Loading />
      </div>
    );
  }

  const headerClassName = buildClassName(
    'EmojiPicker-header',
    'no-scrollbar',
    !shouldHideTopBorder && 'with-top-border',
  );

  return (
    <div className={containerClassName}>
      <div ref={headerRef} className={headerClassName} dir={lang.isRtl ? 'rtl' : undefined}>
        {
          /* Recent emojis category button */
          renderCategoryButton(allCategories[0], 0)
        }

        {
          /* Static emojis category buttons */
          <HorizontalTabSelector
            id={`${EMOJI_PICKER_ID}-${1}`}
            buttonClassName='symbol-set-button'
            options={allCategories.map((category, i) => (
              category.type === 'emoji'
                ? {
                  title: category.name,
                  index: i,
                  icon: ICONS_BY_CATEGORY[category.id],
                }
                : null
            ))
              .filter(Boolean)}
            activeIndex={activeCategoryIndex}
            onSelect={selectCategory}
          />
        }

        {
          /* Custom emoji category buttons */
          <div className="shared-canvas-container">
            <canvas ref={sharedCanvasRef} className="shared-canvas" />
            {allCategories.map((category, i) => {
              if (category.type !== 'custom') {
                return null;
              }
              return renderCategoryButton(category, i);
            })}
          </div>
        }
      </div>
      <div
        ref={containerRef}
        onScroll={handleContentScroll}
        className={buildClassName('EmojiPicker-main', IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll')}
      >
        <EmojiSearch
          className="EmojiPicker-search"
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchMode={searchMode}
          setSearchMode={setSearchMode}
        />

        {!(searchMode && searchQuery) ?
          allCategories.map((category, i) => {
            const commonProps = {
              loadAndPlay: !!canLoadAndPlay,
              index: i,
              isCurrentUserPremium,
              idPrefix: EMOJI_CATEGORY_SELECTOR_ID,
              isSavedMessages,
              isNearActive: activeCategoryIndex >= i - 1 && activeCategoryIndex <= i + 1,
              observeIntersection: observeIntersectionForSet,
              observeIntersectionForPlayingItems: observeIntersectionForPlayingItems,
              observeIntersectionForShowingItems: observeIntersectionForShowingItems,
              onStickerSelect: onCustomEmojiSelect,
            };

            if (category.type === 'recent') {
              return (
                <StickerSet
                  key={RECENT_SYMBOL_SET_ID}
                  stickerSet={{
                    id: RECENT_SYMBOL_SET_ID,
                    accessHash: '0',
                    title: lang('RecentStickers'),
                    stickers: category.emojis as ApiSticker[],
                    count: category.emojis.length,
                    isEmoji: true,
                  }}
                  shouldHideHeader
                  {...commonProps}
                />
              );
            }

            if (category.type === 'custom') {
              const stickerSet = stickerSetsById?.[category.id];
              return stickerSet ? (
                <StickerSet
                  key={stickerSet.id}
                  stickerSet={stickerSet}
                  {...commonProps}
                  onStickerSelect={onCustomEmojiSelect}
                />
              ) : null;
            }

            if (category.type === 'emoji') {
              return (
                <EmojiCategory
                  category={category as EmojiCategory}
                  idPrefix={EMOJI_CATEGORY_SELECTOR_ID}
                  index={i}
                  allEmojis={emojis}
                  observeIntersection={observeIntersectionForSet}
                  shouldRender={activeCategoryIndex >= i - 1 && activeCategoryIndex <= i + 1}
                  onEmojiSelect={handleEmojiSelect}
                />
              );
            }
          }) :
          <div className='EmojiPicker-search-results'>
            {searchResults?.some(r => r.emojis.length) ?
              <> {searchResults.map((category, i) => {
                if (category.type === 'emoji' && category.emojis.length) {
                  return (
                    <EmojiCategory
                      key={category.id}
                      category={category as EmojiCategory}
                      index={i}
                      allEmojis={emojis}
                      observeIntersection={observeIntersectionForSet}
                      shouldRender
                      shouldHideHeader
                      onEmojiSelect={handleEmojiSelect}
                    />
                  );
                }
                if (category.type === 'custom' && category.emojis.length) {
                  const stickerSet: StickerSetOrReactionsSetOrRecent = {
                    id: POPULAR_SYMBOL_SET_ID,
                    accessHash: '0',
                    title: '',
                    stickers: category.emojis as ApiSticker[],
                    count: category.emojis.length,
                    isEmoji: true,
                  };

                  return (
                    <>
                      {
                        searchResults.every((c) => c.emojis.length) &&
                        <div className="EmojiPicker-search-results-divider" />
                      }
                      <StickerSet
                        idPrefix={''}
                        key={category.id}
                        stickerSet={stickerSet}
                        isSavedMessages
                        loadAndPlay={!!canLoadAndPlay}
                        index={i}
                        isCurrentUserPremium
                        shouldHideHeader
                        isNearActive
                        observeIntersection={observeIntersectionForSet}
                        observeIntersectionForPlayingItems={observeIntersectionForPlayingItems}
                        observeIntersectionForShowingItems={observeIntersectionForShowingItems}
                        onStickerSelect={onCustomEmojiSelect}
                      />
                    </>
                  );
                }
              })} </> :
              <div className='EmojiPicker-search-results-placeholder'>
                {'Nothing found'}
              </div>
            }
          </div>
        }
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId }): StateProps => {
    const {
      stickers: {
        setsById: stickerSetsById,
      },
      customEmojis: {
        byId: customEmojisById,
        added: {
          setIds: addedCustomEmojiIds,
        },
      },
      recentCustomEmojis: recentCustomEmojiIds
    } = global;

    const isCurrentUserPremium = selectIsCurrentUserPremium(global);
    const isSavedMessages = Boolean(chatId && selectIsChatWithSelf(global, chatId));

    return {
      recentCustomEmojiIds,
      customEmojisById,
      addedCustomEmojiIds,
      stickerSetsById,
      isCurrentUserPremium,
      isSavedMessages,
    };
  },
)(CombinedEmojiPicker));
