import useLang from '../../hooks/useLang';
import type { FC } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import buildClassName from '../../util/buildClassName';
import Icon from './icons/Icon';
import './EmojiSearch.scss';


type OwnProps = {
  className?: string;
  searchQuery: string;
  searchMode: boolean;
  setSearchQuery: (query: string) => void;
  setSearchMode: (focused: boolean) => void;
};

const EmojiSearch: FC<OwnProps> = ({
  className,
  searchQuery,
  setSearchQuery,
  searchMode,
  setSearchMode,
}: OwnProps) => {
  const lang = useLang();
  // eslint-disable-next-line no-null/no-null
  const inputRef = useRef<HTMLInputElement>(null);

  const closeSearch = () => {
    setSearchMode(false);
    setSearchQuery('');
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  const openSearch = () => {
    setSearchMode(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputOnKeyDown = (e: React.KeyboardEvent) => {
    // Close the search input on Escape key press
    e.key === 'Escape' && closeSearch();
  }

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
          value={searchQuery}
          onFocus={openSearch}
          onKeyDown={handleInputOnKeyDown}
          onClick={openSearch}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Search overlay */}
        <div className={buildClassName('EmojiSearch-overlay')}>
          <div className={buildClassName(
            "EmojiSearch-overlay-placeholder",
            searchQuery?.length > 0 && 'placeholder-hidden'
          )}>
            {lang('Search')}
          </div>
          <div className="EmojiSearch-overlay-buttons">
            {/* <Icon name="search" /> */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmojiSearch;