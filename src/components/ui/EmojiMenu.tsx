import React, { FC, memo, useMemo, useState } from "../../lib/teact/teact";

import { BASE_URL, IS_PACKAGED_ELECTRON } from "../../config";
import { IconName } from "../../types/icons";
import Menu from "./Menu";
import SearchInput from "./SearchInput";
import Icon from "../common/icons/Icon";

import useAppLayout from "../../hooks/useAppLayout";
import buildClassName from "../../util/buildClassName";
import { IS_EMOJI_SUPPORTED, MouseButton } from "../../util/windowEnvironment";

import { EmojiMenuData } from "../left/settings/folders/SettingsFoldersEdit";

import './EmojiMenu.scss';

const EMOJIS_MENU_SEARCH_DEBOUNCE = 200;

type OwnProps = {
  data: EmojiMenuData;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSelection: (emoji: string, isIcon?: boolean) => void;
};

const EmojiMenu: FC<OwnProps> = ({
  data,
  isOpen,
  setIsOpen,
  onSelection
}) => {
  const { isMobile } = useAppLayout();
  const [searchValue, setSearchValue] = useState<string>('');

  // Build src string for emoji
  const buildSrc = (emoji: Emoji) => {
    return `${IS_PACKAGED_ELECTRON ? BASE_URL : '.'}/img-apple-64/${emoji.image}.png`;
  };

  // Get filtered emojis by search term
  const filteredEmojis = useMemo(() => {
    if (!data.emojis) return [];
    const lowerSearch = searchValue.toLowerCase();

    // check in data.emojis which is Map<string, Emoji>
    return Array.from(data.emojis.keys()).filter((emoji) => {
      const emojiData = data.emojis?.get(emoji) as Emoji;
      return emojiData.names.some((name) => name.includes(lowerSearch));
    });
  }, [data, searchValue]);

  // Component for emoji list rendering
  const EmojiList: FC<{
    emojiList: string[],
    type: 'emoji' | 'icon',
    categoryName?: string,
    noWrap?: boolean,
    onEmojiSelect?: (emoji: Emoji) => void
    onIconSelect?: (icon: IconName) => void
  }> = useMemo(() => {
    return ({ emojiList, categoryName, noWrap, type, onEmojiSelect, onIconSelect }) => (
      <>
        {categoryName && (
          <div className="emoji-list-header">
            <p className="emoji-list-header-text" dir="auto">
              {categoryName}
            </p>
          </div>)
        }
        <div className={buildClassName('EmojiList', noWrap && 'no-wrap no-swipe', isMobile && 'mobile')}>
          {emojiList.map((_emoji) => {
            if (type === 'emoji') {
              const emoji = data.emojis?.get(_emoji) as Emoji;
              const src = buildSrc(emoji);
              const [loaded, setLoaded] = useState(false);

              return (
                <div
                  className="EmojiButton"
                  onMouseDown={(e) => e.button === MouseButton.Main && onEmojiSelect?.(emoji)}
                  title={`:${emoji.names[0]}:`}
                >
                  {IS_EMOJI_SUPPORTED ? emoji.native :
                    <img
                      src={src}
                      alt={emoji.native}
                      loading="lazy"
                      data-path={src}
                      draggable={false}
                      onLoad={() => setLoaded(true)}
                      className={loaded ? 'loaded' : ''}
                    />
                  }
                </div>)
            } else if (type === 'icon') {
              const icon = _emoji as IconName;
              return (
                <div
                  className="EmojiButton"
                  onMouseDown={(e) => e.button === MouseButton.Main && onIconSelect?.(icon)}
                  title={`:${icon}:`}
                >
                  <Icon name={icon} className="emojiIcon" />
                </div>
              );
            }
          })
          }
        </div>
      </>
    );
  }, [data, isMobile]);

  return (
    <Menu
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      className={buildClassName('input-emoji-menu', isOpen && 'opened')}
    >
      <div className="input-emoji-menu-content">
        <EmojiList
          emojiList={data.recent || []}
          type="emoji"
          noWrap
          onEmojiSelect={(emoji) => onSelection(emoji.native)}
        />
        <SearchInput
          placeholder="Search emoji" // add lang support
          debounceTime={EMOJIS_MENU_SEARCH_DEBOUNCE}
          onChange={(value) => setSearchValue(value)}
        />
        {searchValue ? (
          <EmojiList
            emojiList={filteredEmojis}
            type="emoji"
            onEmojiSelect={(emoji) => onSelection(emoji.native)}
          />
        ) : (
          <>
            {data.icons && (
              <EmojiList
                emojiList={data.icons}
                type="icon"
                noWrap
                onIconSelect={(icon) => onSelection(icon, true)}
              />
            )}
            {
              data.categories && data.categories.map((category) => (
                <EmojiList
                  emojiList={category.emojis}
                  categoryName={category.name}
                  type="emoji"
                  onEmojiSelect={(emoji) => onSelection(emoji.native)}
                />
              ))
            }
          </>
        )}
      </div>
    </Menu>
  );
}

export default memo(EmojiMenu);
