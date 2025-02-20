import React, { FC, memo, useEffect, useMemo, useRef, useState } from "../../lib/teact/teact";
import { withGlobal } from "../../global";
import { requestMutation } from "../../lib/fasterdom/fasterdom";
import { BASE_URL, IS_PACKAGED_ELECTRON } from "../../config";
import { IconName } from "../../types/icons";
import Menu from "./Menu";
import SearchInput from "./SearchInput";
import Icon from "../common/icons/Icon";

import useLastCallback from "../../hooks/useLastCallback";
import buildClassName from "../../util/buildClassName";

import { IS_EMOJI_SUPPORTED, MouseButton } from "../../util/windowEnvironment";
import { EmojiData, EmojiModule, EmojiRawData, uncompressEmoji } from "../../util/emoji/emoji";
import { FolderIconType } from "../left/foldersMenu/FolderMenuHelper";
import CustomEmojiPicker from "../common/CustomEmojiPicker";
import Button from "./Button";
import { Icons } from "../../types/icons/font";
import Transition from "./Transition";

import './EmojiMenu.scss';


const EMOJIS_MENU_SEARCH_DEBOUNCE = 200;
const EMOJI_MODES: FolderIconType[] = ['emoji', 'icon', 'custom-emoji'];

const EMOJI_MODE_ICONNAME_MAP: Record<FolderIconType, IconName> = {
  'emoji': 'smile',
  'icon': 'document',
  'custom-emoji': 'favorite'
};

enum EMOJI_MODES_TO_NUM {
  'emoji',
  'icon',
  'custom-emoji'
}

/**
 * Build src string for emoji
 * @param emoji emoji.image - string
 * @returns src as string
 */
export const buildEmojiSrc = (emoji: string) => {
  return `${IS_PACKAGED_ELECTRON ? BASE_URL : '.'}/img-apple-64/${emoji}.png`;
};

export type EmojiMenuData = {
  recent?: string[];
  icons?: IconName[];
  categories?: EmojiCategory[];
  emojis?: Map<string, Emoji>;
}

type OwnProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSelection: (iconType: FolderIconType, emoji?: string, documentId?: string) => void;
};

type StateProps = {
  recentEmojis: string[];
};

const EmojiMenu: FC<OwnProps & StateProps> = ({
  isOpen,
  recentEmojis,
  setIsOpen,
  onSelection
}) => {
  const [searchValue, setSearchValue] = useState<string>('');
  const [emojiMenuData, setEmojiMenuData] = useState<EmojiMenuData>();
  const [activeMode, setActiveMode] = useState<FolderIconType>('emoji');
  const emojiContainerRef = useRef<HTMLDivElement>(null);

  // Load regular emojis
  useEffect(() => {
    const exec = () => {
      const recent = recentEmojis;
      const icons = Object.values(Icons);;
      const categories = emojiData.categories
      const emojis = generateAllEmojis(emojiData.emojis);

      setEmojiMenuData({ recent, icons, categories, emojis });
    };

    if (emojiData) {
      exec();
    } else {
      ensureEmojiData()
        .then(exec);
    }
  }, []);

  // Generate regular emojis name-Emoji Map for search
  const generateAllEmojis = useLastCallback((allEmojis: AllEmojis) => {
    const emojis: Map<string, Emoji> = new Map();
    for (const emoji of Object.values(allEmojis)) {
      if (!emoji) continue;
      const _emoji: Emoji = 'id' in emoji ? emoji : emoji[1];
      emojis.set(_emoji.names[0], _emoji);
    }
    return emojis;
  });

  // Get filtered emojis by search value
  const filteredEmojis = useMemo(() => {
    if (
      !emojiMenuData?.emojis
      || activeMode !== 'emoji'
      || !searchValue
    ) return [];
    const lowerSearch = searchValue.toLowerCase();
    return Array.from(emojiMenuData.emojis.keys()).filter((emoji) => {
      const emojiData = emojiMenuData.emojis?.get(emoji) as Emoji;
      return emojiData.names.some((name) => name.includes(lowerSearch));
    });
  }, [emojiMenuData, searchValue, activeMode]);

  // Get filtered icons by search term
  const filteredIcons = useMemo(() => {
    if (
      !emojiMenuData?.icons
      || activeMode !== 'icon'
      || !searchValue
    ) return [];
    const lowerSearch = searchValue.toLowerCase();
    return emojiMenuData.icons.filter((icon) => icon.includes(lowerSearch));
  }, [emojiMenuData, searchValue, activeMode]);

  // Get Emojis container by active mode
  const getEmojisByMode = useLastCallback(
    (isActive: boolean, isFrom: boolean) => {
      switch (activeMode) {
        case 'emoji':
          return (
            <div>
              <EmojiList
                emojiList={emojiMenuData?.recent || []}
                categoryName={'Recently used'}
                type="emoji"
                onEmojiSelect={(emoji) => onSelection('emoji', emoji.image)
                }
              />
              {emojiMenuData?.categories?.map((category) => (
                <EmojiList
                  emojiList={category.emojis}
                  categoryName={category.name}
                  type="emoji"
                  onEmojiSelect={(emoji) => onSelection('emoji', emoji.image)
                  }
                />
              ))}
            </div>
          );
        case 'icon':
          return (
            <EmojiList
              emojiList={emojiMenuData?.icons || []}
              type="icon"
              onIconSelect={(icon) => onSelection('icon', icon)}
            />
          );
        case 'custom-emoji':
          return (
            <CustomEmojiPicker
              className="picker-tab"
              isHidden={!isOpen || !isActive}
              loadAndPlay={isOpen && (isActive || isFrom)}
              onCustomEmojiSelect={(emoji) => emoji?.emoji && onSelection('custom-emoji', emoji.emoji, emoji.id)}
            />
          );
      }
    });

  // Component for regular emoji rendering
  const EmojiImage: FC<{ src: string }> = memo(({ src }) => {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const img = new Image();
      img.draggable = false;
      img.src = src;

      const setSrcToImage = () => {
        requestMutation(() => {
          if (divRef.current) {
            divRef.current.style.backgroundImage = `url(${src})`;
            setLoaded(true);
          }
        });
      }

      if (img.complete) {
        setSrcToImage();
      } else {
        img.onload = setSrcToImage;
        img.onerror = () => setError(true);
      }
    }, [src]);

    return (
      <>
        {!loaded && <div className="EmojiImageSkeleton" />}
        <div
          ref={divRef}
          className={buildClassName('EmojiImage', loaded && 'loaded', error && 'error')}
        />
      </>
    );
  });

  // Component for Emoji/FontIcon grid rendering
  const EmojiList: FC<{
    emojiList: string[],
    type: 'emoji' | 'icon',
    categoryName?: string,
    onEmojiSelect?: (emoji: Emoji) => void
    onIconSelect?: (icon: IconName) => void
  }> = useMemo(() => {
    return ({ emojiList, categoryName, type, onEmojiSelect, onIconSelect }) => (
      <>
        {categoryName && (
          <div className="emoji-list-header">
            <p className="emoji-list-header-text" dir="auto">
              {categoryName}
            </p>
          </div>)
        }
        <div className={buildClassName('EmojiList', 'no-swipe')}>
          {emojiList.map((_emoji) => {
            if (type === 'emoji') {
              const emoji = emojiMenuData?.emojis?.get(_emoji) as Emoji;
              const src = buildEmojiSrc(emoji.image);
              return (
                <div
                  className="EmojiButton"
                  onMouseDown={(e) => e.button === MouseButton.Main && onEmojiSelect?.(emoji)}
                  title={`:${emoji.names[0]}:`}
                >
                  {IS_EMOJI_SUPPORTED ? emoji.native : <EmojiImage src={src} />}
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
  }, [emojiMenuData]);

  return (
    <Menu
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      className={buildClassName('input-emoji-menu', isOpen && 'opened')}
    >
      <div className="input-emoji-menu-content">
        <SearchInput
          disabled={activeMode === 'custom-emoji'}
          placeholder="Search emoji" // add lang support
          debounceTime={EMOJIS_MENU_SEARCH_DEBOUNCE}
          onChange={(value) => setSearchValue(value)}
        />
        <div className="emoji-container">
          {searchValue ? (
            <EmojiList
              emojiList={
                activeMode === 'emoji' ? filteredEmojis : filteredIcons
              }
              type={activeMode === 'emoji' ? 'emoji' : 'icon'}
              onEmojiSelect={(emoji) => onSelection('emoji', emoji.image)}
            />
          ) :
            <Transition
              ref={emojiContainerRef}
              name="slide"
              activeKey={EMOJI_MODES_TO_NUM[activeMode]}
            >
              {getEmojisByMode}
            </Transition>
          }
        </div>
      </div>

      <div className="input-emoji-menu-footer">
        {EMOJI_MODES.map((mode) => (
          <Button
            color='translucent'
            round
            faded
            ariaLabel={mode}
            className={buildClassName('emoji-mode', activeMode === mode && 'active')}
            onClick={() => setActiveMode(mode)}
          ><i className={buildClassName('icon', `icon-${EMOJI_MODE_ICONNAME_MAP[mode]}`)} />
          </Button>)
        )}
      </div>
    </Menu>
  );
}

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const { recentEmojis } = global;
    return { recentEmojis };
  }
)(EmojiMenu));

let emojiDataPromise: Promise<EmojiModule>;
let emojiRawData: EmojiRawData;
let emojiData: EmojiData;

// Upload regular emojis data
async function ensureEmojiData() {
  if (!emojiDataPromise) {
    emojiDataPromise = import('emoji-data-ios/emoji-data.json');
    emojiRawData = (await emojiDataPromise).default;
    emojiData = uncompressEmoji(emojiRawData);
  }

  return emojiDataPromise;
}
