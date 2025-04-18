import type { FC } from '../../../lib/teact/teact';
import React, { useCallback, useEffect, useMemo, useRef, useState } from '../../../lib/teact/teact';
import buildClassName from '../../../util/buildClassName';
import { debounce } from '../../../util/schedulers';

import useLang from '../../../hooks/useLang';
import useAppLayout from '../../../hooks/useAppLayout';
import useHorizontalScroll from '../../../hooks/useHorizontalScroll';

import Icon from '../icons/Icon';
import { IconName } from '../../../types/icons';
import Button from '../../ui/Button';

import './EmojiSearch.scss';


type OwnProps = {
  className?: string;
  placeholderSuffix?: string;
  debounceTime?: number;
  searchQuery: string[];
  searchMode: boolean;
  setSearchQuery: (query: string[]) => void;
  setSearchMode: (focused: boolean) => void;
};

type SearchOverlayButton = {
  icon: IconName;
  query: string[];
}

const SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX = 'msg_emoji_';
const SEARCH_OVERLAY_BUTTONS: SearchOverlayButton[] = [
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}heart`,
    query: ['love', 'heart', 'kiss'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}like`,
    query: ['up', 'ok', 'muscle', 'handshake'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}dislike`,
    query: ['down', 'no', 'facepalm', 'vomit', 'nause'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}party`,
    query: ['party', 'tada',  'firework', 'confetti', 'danc'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}haha`,
    query: ['laugh', 'smil', 'struck', 'grin'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}omg`,
    query: ['omg', 'hushed', 'astonished', 'frown'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}sad`,
    query: ['sad', 'frown', 'unamused', 'disappointed', 'anguished'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}angry`,
    query: ['angry', 'rage', 'symbols_on_mouth', ],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}neutral`,
    query: ['neutral', 'expressionless'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}what`,
    query: ['think', 'brain', 'monocle', 'disguised', 'raised_eyebrow', 'rolling_eyes'],
  },
  {
    icon: `${SEARCH_OVERLAY_BUTTONS_ICONS_PREFIX}tongue`,
    query: ['tongue', 'zany', 'woozy', 'money_mouth', 'clown'],
  },
]

const EmojiSearch: FC<OwnProps> = ({
  className,
  searchQuery,
  setSearchQuery,
  searchMode,
  setSearchMode,
  placeholderSuffix,
  debounceTime = 250,
}: OwnProps) => {
  const lang = useLang();
  const { isMobile } = useAppLayout();

  // eslint-disable-next-line no-null/no-null
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line no-null/no-null
  const overlayRef = useRef<HTMLDivElement>(null);

  overlayRef.current && useHorizontalScroll(overlayRef, isMobile, true);

  const [inputValue, setInputValue] = useState('');
  const [activeOverlayButton, setActiveOverlayButton] = useState<number | null>(null);

  const closeSearch = () => {
    setSearchMode(false);
    setSearchQuery([]);
    setInputValue('');
    setActiveOverlayButton(null);

    if (inputRef.current) {
      inputRef.current.blur();
    }

    // Reset scroll position
    if (overlayRef.current) {
      overlayRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
    
  };

  const openSearch = () => {
    setSearchMode(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const renderSearchIcon = useMemo(() => {
    const handleIconClick = () => {
      searchMode ? closeSearch() : openSearch();
    };

    return (
      <div
        className="EmojiSearch-icon-container"
        onClick={handleIconClick}
      >
        <Icon
          name={'search'}
          className={buildClassName(
            "EmojiSearch-icon",
            "EmojiSearch-icon-search",
            !searchMode && 'icon-active'
          )}
        />
        <Icon
          name={'close'}
          className={buildClassName(
            "EmojiSearch-icon",
            "EmojiSearch-icon-close",
            searchMode && 'icon-active'
          )}
        />
      </div>
    )
  }, [searchMode]);

  // Temporary solution for search query debounce
  // While having inputValue as a state
  // To update instantly UI
  const handleInputChange = (inputValue: string) => {
    inputValue ?
      setSearchQuery(inputValue.split(' ')) :
      setSearchQuery([]);
    setActiveOverlayButton(null);
  }
  const debouncedInputChange = useCallback(debounce(handleInputChange, debounceTime, false), []);
  useEffect(() => {
    debouncedInputChange(inputValue);
  }, [inputValue]);

  // As palceholder over input and has no pointer events (for better input UX)
  // Every Input wheel event applied to overlay manually here
  useEffect(() => {
    const currentContainer = inputRef.current;
    if (!currentContainer) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      overlayRef.current?.scrollBy({ left: e.deltaY / 4 });
    };

    currentContainer.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      currentContainer.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div className={buildClassName(className, 'EmojiSearch')}>
      {/* Search icon */}
      {renderSearchIcon}

      <div className="EmojiSearch-input">
        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          dir="auto"
          autoComplete='off'
          placeholder=''
          value={inputValue}
          onFocus={openSearch}
          onClick={openSearch}
          onChange={e => setInputValue(e.target.value)}
        />

        {/* Search overlay */}
        <div
          ref={overlayRef}
          className={buildClassName('EmojiSearch-overlay', 'no-scrollbar')}
        >
          <div className={buildClassName(
            "EmojiSearch-overlay-placeholder",
            !!inputValue.length && 'placeholder-hidden'
          )}>
            {lang('Search') + (placeholderSuffix ? ` ${placeholderSuffix}` : '')}
          </div>
          <div className={buildClassName(
            "EmojiSearch-overlay-buttons",
            !!inputValue.length && 'EmojiSearch-overlay-buttons-hidden'
          )}>
            {SEARCH_OVERLAY_BUTTONS.map((button, index) => (
              <Button
                className={buildClassName(
                  "EmojiSearch-overlay-button",
                  activeOverlayButton === index && 'EmojiSearch-overlay-button-active'
                )}
                key={`overlay-button-${index}`}
                ariaLabel={button.query[0]}
                round
                faded
                color="translucent"
                onClick={() => {
                  openSearch();
                  if (inputRef.current) {
                    inputRef.current.blur();
                    inputRef.current.value = '';
                  }
                  setActiveOverlayButton(index);
                  setSearchQuery(button.query);
                }}
              >
                <Icon name={button.icon}/>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmojiSearch;