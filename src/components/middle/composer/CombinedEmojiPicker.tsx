import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo,
  useRef, useState,
} from '../../../lib/teact/teact';
import { withGlobal } from '../../../global';

import type { GlobalState } from '../../../global/types';
import type { IconName } from '../../../types/icons';
import type {
  EmojiData,
  EmojiModule,
  EmojiRawData,
} from '../../../util/emoji/emoji';

import { MENU_TRANSITION_DURATION, RECENT_SYMBOL_SET_ID } from '../../../config';
import animateHorizontalScroll from '../../../util/animateHorizontalScroll';
import { requestMeasure } from '../../../lib/fasterdom/fasterdom';
import { debounce } from '../../../util/schedulers';
import buildClassName from '../../../util/buildClassName';
import { uncompressEmoji } from '../../../util/emoji/emoji';
import { pick } from '../../../util/iteratees';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';
import { REM } from '../../common/helpers/mediaDimensions';

import useAppLayout from '../../../hooks/useAppLayout';
import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useLastCallback from '../../../hooks/useLastCallback';
import useLang from '../../../hooks/useLang';
import useScrolledState from '../../../hooks/useScrolledState';
import useAsyncRendering from '../../right/hooks/useAsyncRendering';

import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import Loading from '../../ui/Loading';
import HorizontalTabSelector from '../../ui/HorizontalTabSelector';
import EmojiCategory from './EmojiCategory';

import './CombinedEmojiPicker.scss';

type OwnProps = {
  className?: string;
  onEmojiSelect: (emoji: string, name: string) => void;
};

type StateProps = Pick<GlobalState, 'recentEmojis'>;

type EmojiCategoryData = { id: string; name: string; emojis: string[] };

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

const OPEN_ANIMATION_DELAY = 200;
const SMOOTH_SCROLL_DISTANCE = 100;
const FOCUS_MARGIN = 3.25 * REM;
const HEADER_BUTTON_WIDTH = 2.625 * REM; // Includes margins
const INTERSECTION_THROTTLE = 200;

const categoryIntersections: Record<number, boolean> = {};

let categoryIntersectionsTimeout: NodeJS.Timeout;

let emojiDataPromise: Promise<EmojiModule>;
let emojiRawData: EmojiRawData;
let emojiData: EmojiData;

const CombinedEmojiPicker: FC<OwnProps & StateProps> = ({
  className,
  recentEmojis,
  onEmojiSelect,
}) => {
  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const headerRef = useRef<HTMLDivElement>(null);

  const [categories, setCategories] = useState<EmojiCategoryData[]>();
  const [emojis, setEmojis] = useState<AllEmojis>();
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);

  const { isMobile } = useAppLayout();
  const {
    handleScroll: handleContentScroll,
    isAtBeginning: shouldHideTopBorder,
  } = useScrolledState();

  const {
    observe: observeIntersection,
    freeze: freezeIntersection,
    unfreeze: unfreezeIntersection,
  } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  }, (entries) => {
    // Update the intersection state for each category
    entries.forEach((entry) => {
      const { id } = entry.target as HTMLDivElement;
      if (!id || !id.startsWith('emoji-category-')) {
        return;
      }

      const index = Number(id.replace('emoji-category-', ''));
      categoryIntersections[index] = entry.isIntersecting;
    });

    // Get the lowest intersecting index
    const intersectingIndexes =
      Object.entries(categoryIntersections)
        .filter(([_, isIntersecting]) => isIntersecting)
        .map(([index, _]) => Number(index));

    // Set the active category index to the lowest intersecting index (if there are any)
    intersectingIndexes?.length && setActiveCategoryIndex(Math.min(...intersectingIndexes));
  });

  const canRenderContents = useAsyncRendering([], MENU_TRANSITION_DURATION);
  const shouldRenderContent = emojis && canRenderContents;

  useHorizontalScroll(headerRef, !(isMobile && shouldRenderContent));

  // Scroll header when active set updates
  useEffect(() => {
    if (!categories) {
      return;
    }

    const header = headerRef.current;
    if (!header) {
      return;
    }

    const newLeft = activeCategoryIndex * HEADER_BUTTON_WIDTH - header.offsetWidth / 2 + HEADER_BUTTON_WIDTH / 2;

    animateHorizontalScroll(header, newLeft);
  }, [categories, activeCategoryIndex]);

  const lang = useLang();

  const allCategories = useMemo(() => {
    if (!categories) {
      return MEMO_EMPTY_ARRAY;
    }
    const themeCategories = [...categories];
    if (recentEmojis?.length) {
      themeCategories.unshift({
        id: RECENT_SYMBOL_SET_ID,
        name: lang('RecentStickers'),
        emojis: recentEmojis,
      });
    }

    return themeCategories;
  }, [categories, lang, recentEmojis]);

  // Initialize data on first render.
  useEffect(() => {
    setTimeout(() => {
      const exec = () => {
        setCategories(emojiData.categories);

        setEmojis(emojiData.emojis as AllEmojis);
      };

      if (emojiData) {
        exec();
      } else {
        ensureEmojiData()
          .then(exec);
      }
    }, OPEN_ANIMATION_DELAY);
  }, []);

  /**
   * Scroll to the category
   * @param index - The index of the category to scroll to
   */
  const scrollToCategory = (index: number) => {
    const categoryEl = containerRef.current!.closest<HTMLElement>('.SymbolMenu-main')!
      .querySelector(`#emoji-category-${index}`)! as HTMLElement;

    const container = containerRef.current;
    if (!container) return;

    requestMeasure(() => {
      // Calculate the target scroll position
      const targetScrollTop = categoryEl.offsetTop - FOCUS_MARGIN;

      // Get the current scroll position
      const currentScrollTop = container.scrollTop;

      // Determine from where we approach the target
      const scrollDirection = currentScrollTop > targetScrollTop ? 1 : -1;

      // Calculate the target 'instant' scroll position
      const targetScrollTopInstant = targetScrollTop + scrollDirection * SMOOTH_SCROLL_DISTANCE;

      // Check if current scroll position is already closer then 'instant' one to the target
      const scrollInstantTo = scrollDirection === -1 ?
        Math.max(targetScrollTopInstant, currentScrollTop) :
        Math.min(targetScrollTopInstant, currentScrollTop);

      // Instant scroll before target position
      container.scrollTo({
        top: scrollInstantTo,
        behavior: 'instant',
      });

      // Smooth scroll to the target position
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });

      /**
       * Freeze the intersection observer while scrolling
       * As it will set the active category index(es) while scrolling
       * Using debounce as there are multiple scrollend events coming
       */
      freezeIntersection(true);

      // Fallback if the intersection observer is not unfreezed in time
      // Not required, but prevent from freezing if user would start scrolling fast purposely after selecting a category
      // As need to use 'scroll' instead of 'scrollend' event listener,
      // because 'scrollend' event is not fired on mobile (tested on iOS, Chrome)
      clearTimeout(categoryIntersectionsTimeout);
      categoryIntersectionsTimeout = setTimeout(() => {
        container.removeEventListener('scroll', handleScrollEnd);
        unfreezeIntersection();
      }, 500);

      // Handle the scroll end event with debounce
      const handleScrollEnd = debounce(() => {
        unfreezeIntersection();
        container.removeEventListener('scroll', handleScrollEnd);
        clearTimeout(categoryIntersectionsTimeout);
      }, 200, false, true);

      // Remove old the event listener and timeout before adding new one
      container.removeEventListener('scroll', handleScrollEnd);
      container.addEventListener('scroll', handleScrollEnd);
    });
  };

  const selectCategory = useLastCallback((index: number) => {
    setActiveCategoryIndex(index);

    /**
     * Created custom scroll animation
     * When using animateScroll, the scroll is blocking other animations (e.g. scroll in the header)
     * It was not an issue in the previous implementation because there were no other animations
     * Now it's not blocking any animation
     */
    scrollToCategory(index);
  });

  const handleEmojiSelect = useLastCallback((emoji: string, name: string) => {
    onEmojiSelect(emoji, name);
  });

  function renderCategoryButton(category: EmojiCategoryData, index: number) {
    const icon = ICONS_BY_CATEGORY[category.id];

    return icon && (
      <Button
        className={`symbol-set-button ${index === activeCategoryIndex ? 'activated' : ''}`}
        round
        faded
        color="translucent"
        // eslint-disable-next-line react/jsx-no-bind
        onClick={() => selectCategory(index)}
        ariaLabel={category.name}
      >
        <Icon name={icon} />
      </Button>
    );
  }

  const containerClassName = buildClassName('EmojiPicker', className);

  if (!shouldRenderContent) {
    return (
      <div className={containerClassName}>
        <Loading />
      </div>
    );
  }

  const headerClassName = buildClassName(
    'EmojiPicker-header',
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
            options={allCategories.slice(1).map((category, i) => ({
              title: category.name[0],
              index: i + 1,
              icon: ICONS_BY_CATEGORY[category.id],
            }))}
            activeIndex={activeCategoryIndex}
            onSelect={selectCategory}
          />
        }

        {/* {allCategories.map(renderCategoryButton)} */}
      </div>
      <div
        ref={containerRef}
        onScroll={handleContentScroll}
        className={buildClassName('EmojiPicker-main', IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll')}
      >
        {allCategories.map((category, i) => (
          <EmojiCategory
            category={category}
            index={i}
            allEmojis={emojis}
            observeIntersection={observeIntersection}
            shouldRender={activeCategoryIndex >= i - 1 && activeCategoryIndex <= i + 1}
            onEmojiSelect={handleEmojiSelect}
          />
        ))}
      </div>
    </div>
  );
};

async function ensureEmojiData() {
  if (!emojiDataPromise) {
    emojiDataPromise = import('emoji-data-ios/emoji-data.json');
    emojiRawData = (await emojiDataPromise).default;

    emojiData = uncompressEmoji(emojiRawData);
  }

  return emojiDataPromise;
}

export default memo(withGlobal<OwnProps>(
  (global): StateProps => pick(global, ['recentEmojis']),
)(CombinedEmojiPicker));
