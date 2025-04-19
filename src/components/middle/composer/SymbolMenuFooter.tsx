import type { FC } from '../../../lib/teact/teact';
import React, { memo } from '../../../lib/teact/teact';

import buildClassName from '../../../util/buildClassName';

import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';

import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';

type OwnProps = {
  activeTab: SymbolMenuTabs;
  onSwitchTab: (tab: SymbolMenuTabs) => void;
  onRemoveSymbol: () => void;
  onSearchOpen: (type: 'stickers' | 'emojis') => void;
  canSendPlainText?: boolean;
  canSearch?: boolean;
};

export enum SymbolMenuTabs {
  'Emoji',
  'Stickers',
  'GIFs',
}

export const SYMBOL_MENU_TAB_TITLES: Record<SymbolMenuTabs, string> = {
  [SymbolMenuTabs.Emoji]: 'Emoji',
  [SymbolMenuTabs.Stickers]: 'AccDescrStickers',
  [SymbolMenuTabs.GIFs]: 'GifsTab',
};

const SYMBOL_MENU_TAB_ICONS = {
  [SymbolMenuTabs.Emoji]: 'icon-smile',
  [SymbolMenuTabs.Stickers]: 'icon-stickers-face',
  [SymbolMenuTabs.GIFs]: 'icon-gifs',
};

const SymbolMenuFooter: FC<OwnProps> = ({
  activeTab, onSwitchTab, onRemoveSymbol, onSearchOpen,
  canSendPlainText, canSearch,
}) => {
  const lang = useOldLang();

  function renderTabButton(tab: SymbolMenuTabs) {
    return (
      <Button
        className={`symbol-tab-button ${activeTab === tab ? 'activated' : ''}`}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={() => onSwitchTab(tab)}
        ariaLabel={lang(SYMBOL_MENU_TAB_TITLES[tab])}
        round
        faded
        color="translucent"
      >
        <i className={buildClassName('icon', SYMBOL_MENU_TAB_ICONS[tab])} />
      </Button>
    );
  }

  const handleSearchOpen = useLastCallback(() => {
    onSearchOpen(activeTab === SymbolMenuTabs.Stickers ? 'stickers' : 'emojis');
  });

  function stopPropagation(event: any) {
    event.stopPropagation();
  }

  return (
    <div className="SymbolMenu-footer"
      onClick={stopPropagation}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      {activeTab === SymbolMenuTabs.Stickers && canSearch && (
        <Button
          className="symbol-search-button"
          ariaLabel='Search Stickers'
          round
          faded
          color="translucent"
          onClick={handleSearchOpen}
        >
          <Icon name="add" />
        </Button>
      )}

      {canSendPlainText && renderTabButton(SymbolMenuTabs.Emoji)}
      {renderTabButton(SymbolMenuTabs.Stickers)}
      {renderTabButton(SymbolMenuTabs.GIFs)}

      {activeTab === SymbolMenuTabs.Emoji && (
        <Button
          className="symbol-delete-button"
          onClick={() => onRemoveSymbol()}
          ariaLabel="Remove Symbol"
          round
          faded
          color="translucent"
        >
          <Icon name="delete-left" />
        </Button>
      )}
    </div>
  );
};

export default memo(SymbolMenuFooter);
