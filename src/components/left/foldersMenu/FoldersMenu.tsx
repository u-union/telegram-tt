import React, { FC, memo, useMemo, useRef, useEffect } from "../../../lib/teact/teact";
import { ALL_FOLDER_ID, ALL_FOLDER_MENU_ICON, APP_NAME, CHAT_HEIGHT_PX, DEBUG, IS_BETA } from "../../../config";
import { getActions, getGlobal, withGlobal } from "../../../global";
import { selectTabState } from "../../../global/selectors/tabs";
import { selectCurrentLimit } from "../../../global/selectors/limits";
import { selectCanShareFolder } from "../../../global/selectors";

import type { ApiChatFolder, ApiChatlistExportedInvite } from '../../../api/types';
import { LeftColumnContent } from "../../../types";
import { IconName } from "../../../types/icons";

import useAppLayout from "../../../hooks/useAppLayout";
import useFlag from "../../../hooks/useFlag";
import useLang from "../../../hooks/useLang";
import useHistoryBack from "../../../hooks/useHistoryBack";
import useLastCallback from "../../../hooks/useLastCallback";
import { useFullscreenStatus } from "../../../hooks/window/useFullscreen";
import { useFolderManagerForUnreadCounters } from "../../../hooks/useFolderManager";

import buildClassName from "../../../util/buildClassName";
import { IS_ELECTRON, IS_MAC_OS } from "../../../util/windowEnvironment";
import captureEscKeyListener from "../../../util/captureEscKeyListener";
import { MEMO_EMPTY_ARRAY } from "../../../util/memo";

import Button from "../../ui/Button";
import DropdownMenu from "../../ui/DropdownMenu";
import LeftSideMenuItems from "../main/LeftSideMenuItems";
import { MenuItemContextAction } from "../../ui/ListItem";
import { TabWithProperties } from "../../ui/TabList";
import FolderMenuButton from "./FolderMenuButton";
import { FolderDetails, loadFolderDetails } from "./FolderMenuHelper";

import './FoldersMenu.scss';

const SAVED_MESSAGES_HOTKEY = '0';

type OwnProps = {
  isOpen?: boolean;
  content: LeftColumnContent;
  isForumPanelOpen?: boolean;
  shouldSkipTransition?: boolean;
  onReset: NoneToVoidFunction;
  onContentChange: (content: LeftColumnContent) => void;
}

type StateProps = {
  chatFoldersById: Record<number, ApiChatFolder>;
  currentUserId?: string;
  folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
  orderedFolderIds?: number[];
  activeChatFolder: number;
  maxFolders: number;
  maxFolderInvites: number;
  maxChatLists: number;
};

const FoldersMenu: FC<OwnProps & StateProps> = ({
  isOpen,
  activeChatFolder,
  content,
  chatFoldersById,
  currentUserId,
  folderInvitesById,
  maxFolders,
  maxFolderInvites,
  maxChatLists,
  orderedFolderIds,
  shouldSkipTransition,
  onContentChange,
  onReset,
}) => {

  const {
    closeForumPanel,
    setActiveChatFolder,
    openChat,
    openShareChatFolderModal,
    openDeleteChatFolderModal,
    openEditChatFolder,
    openLimitReachedModal,
  } = getActions();

  const handleSelectArchived = useLastCallback(() => {
    onContentChange(LeftColumnContent.Archived);
    closeForumPanel();
  });

  const handleSelectSettings = useLastCallback(() => {
    onContentChange(LeftColumnContent.Settings);
  });

  const handleSelectContacts = useLastCallback(() => {
    onContentChange(LeftColumnContent.Contacts);
  });

  const handleSwitchTab = useLastCallback((index: number) => {
    // If content is not chat list, switch to chat list
    if (content !== LeftColumnContent.ChatList) {
      onContentChange(LeftColumnContent.ChatList);
    }
    setActiveChatFolder({ activeChatFolder: index }, { forceOnHeavyAnimation: true });
  });

  const lang = useLang();
  const { isMobile } = useAppLayout();
  const isFullscreen = useFullscreenStatus();
  const isChatListContent = content === LeftColumnContent.ChatList;

  const folderMenuRef = useRef<HTMLDivElement>(null);
  const folderCountersById = useFolderManagerForUnreadCounters();
  const [isBotMenuOpen, markBotMenuOpen, unmarkBotMenuOpen] = useFlag();

  const versionString = IS_BETA ? `${APP_VERSION} Beta (${APP_REVISION})` : (DEBUG ? APP_REVISION : APP_VERSION);

  // Create All Chats (default) folder manually
  const allChatsFolder: ApiChatFolder = useMemo(() => {
    return {
      id: ALL_FOLDER_ID,
      title: { text: lang('FilterAllChats').length > 9 ? lang('FilterAllChatsShort') : lang('FilterAllChats') },
      includedChatIds: MEMO_EMPTY_ARRAY,
      excludedChatIds: MEMO_EMPTY_ARRAY,
    } satisfies ApiChatFolder;
  }, [orderedFolderIds, lang]);

  // Map folders by order
  const displayedFolders = useMemo(() => {
    return orderedFolderIds
      ? orderedFolderIds
      .map((id) => id === ALL_FOLDER_ID ? allChatsFolder : chatFoldersById[id] || {}).filter(Boolean)
      : undefined;
  }, [chatFoldersById, allChatsFolder, orderedFolderIds]);

  // Preprocess folders for displauing
  const folderTabs = useMemo(() => {
    if (!displayedFolders || !displayedFolders.length) {
      return undefined;
    }

    return displayedFolders.map((folder, i) => {
      const { id, title } = folder;
      const isBlocked = id !== ALL_FOLDER_ID && i > maxFolders - 1;
      const canShareFolder = selectCanShareFolder(getGlobal(), id);
      const contextActions: MenuItemContextAction[] = [];
      // Get icon details from local storage
      const details: FolderDetails | null =
        id === ALL_FOLDER_ID ?
        { icon: ALL_FOLDER_MENU_ICON, iconType: 'icon' } :
        loadFolderDetails(id);

      if (canShareFolder) {
        contextActions.push({
          title: lang('FilterShare'),
          icon: 'link',
          handler: () => {
            const chatListCount = Object.values(chatFoldersById).reduce((acc, el) => acc + (el.isChatList ? 1 : 0), 0);
            if (chatListCount >= maxChatLists && !folder.isChatList) {
              openLimitReachedModal({
                limit: 'chatlistJoined',
              });
              return;
            }

            // Greater amount can be after premium downgrade
            if (folderInvitesById[id]?.length >= maxFolderInvites) {
              openLimitReachedModal({
                limit: 'chatlistInvites',
              });
              return;
            }

            openShareChatFolderModal({
              folderId: id,
            });
          },
        });
      }

      if (id !== ALL_FOLDER_ID) {
        contextActions.push({
          title: lang('FilterEdit'),
          icon: 'edit',
          handler: () => {
            openEditChatFolder({ folderId: id });
          },
        });

        contextActions.push({
          title: lang('FilterDelete'),
          icon: 'delete',
          destructive: true,
          handler: () => {
            openDeleteChatFolderModal({ folderId: id });
          },
        });
      } else {
        contextActions.push({
          title: lang('NothingFound'),
          icon: 'info',
          handler: undefined,
        });
      }

        return {
        id,
        title: title.text,
        icon: details?.icon || 'folder-badge',
        iconType: details?.iconType || 'icon',
        documentId: details?.documentId,
        badgeCount: folderCountersById[id]?.chatsCount,
        isBadgeActive: Boolean(folderCountersById[id]?.notificationsCount),
        isBlocked,
        contextActions: contextActions?.length ? contextActions : undefined,
      } satisfies TabWithProperties;
    });
  }, [
    displayedFolders, maxFolders, folderCountersById, lang, chatFoldersById, maxChatLists, folderInvitesById,
    maxFolderInvites,
  ]);

  // Go to first folder when pressing ESC
  const isInAllFolder = activeChatFolder === ALL_FOLDER_ID;
  useEffect(() => {
    if (!isInAllFolder) {
      return captureEscKeyListener(() => {
        setActiveChatFolder({ activeChatFolder: ALL_FOLDER_ID });
      });
    }
  }, [activeChatFolder, setActiveChatFolder]);

  // Go to 'All Chats' when pressed Browser hist 'back' button
  useHistoryBack({
    isActive: !isInAllFolder,
    onBack: () => setActiveChatFolder({ activeChatFolder: ALL_FOLDER_ID }, { forceOnHeavyAnimation: true }),
  });

  // Handle key SHORTCUTS to open chat folders
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code.startsWith('Digit')) {
        const [, digit] = e.code.match(/Digit(\d)/) || [];
        if (!digit) return;

        if (digit === SAVED_MESSAGES_HOTKEY) {
          openChat({ id: currentUserId, shouldReplaceHistory: true });
          return;
        }

        const folder = Number(digit) - 1;
        // if (folder > folderTabs.length - 1) return;

        setActiveChatFolder({ activeChatFolder: folder }, { forceOnHeavyAnimation: true });
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [currentUserId, folderTabs, openChat, setActiveChatFolder]);

  // Prevent `activeTab` pointing at non-existing folder after update
  useEffect(() => {
    if (!folderTabs?.length) return;

    if (activeChatFolder >= folderTabs.length) {
      setActiveChatFolder({ activeChatFolder: ALL_FOLDER_ID });
    }
  }, [activeChatFolder, folderTabs, setActiveChatFolder]);

  // Dropdown menu button
  const MainButton: FC<{ onTrigger: () => void; isOpen?: boolean }> = useMemo(() => {
    return ({ onTrigger, isOpen }) => (
      <Button
        round
        ripple={isChatListContent && !isMobile}
        size="smaller"
        color="translucent"
        className={isOpen ? 'active' : ''}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={isChatListContent ? onTrigger : () => onReset()}
        ariaLabel={isChatListContent ? lang('AccDescrOpenMenu2') : 'Return to chat list'}
      >
        <div className={buildClassName(
          'animated-menu-icon',
          !isChatListContent && 'state-back',
          shouldSkipTransition && 'no-animation',
        )}
        />
      </Button>
    );
  }, [isChatListContent, isMobile, lang, onReset, shouldSkipTransition]);

  return (
    <div ref={folderMenuRef} id="FolderMenu" className={buildClassName('LeftColumn-menu', isOpen && 'open')}>
      <div className="LeftColumn-menu-header">
        {/* {oldLang.isRtl && <div className="DropdownMenuFiller" />} */} {/* check */}
        <DropdownMenu
          footer={`${APP_NAME} ${versionString}`}
          trigger={MainButton}
          className={buildClassName(
            'main-menu',
            lang.isRtl && 'rtl',
          )}
          forceOpen={isBotMenuOpen}
          transformOriginX={IS_ELECTRON && IS_MAC_OS && !isFullscreen ? 90 : undefined}
        >
          <LeftSideMenuItems
            onSelectArchived={handleSelectArchived}
            onSelectContacts={handleSelectContacts}
            onSelectSettings={handleSelectSettings}
            onBotMenuOpened={markBotMenuOpen}
            onBotMenuClosed={unmarkBotMenuOpen}
          />
        </DropdownMenu>
      </div>
      <div className="LeftColumn-menu-items">
        {folderTabs?.map((tab, i) => {
          return (
            <FolderMenuButton
              key={tab.id}
              badgeCount={tab.badgeCount}
              contextActions={tab.contextActions}
              icon={tab.icon}
              iconType={tab.iconType}
              documentId={tab.documentId}
              index={i}
              isActive={i === activeChatFolder && isChatListContent}
              isBlocked={tab.isBlocked}
              name={tab.title.toString()}
              onClick={handleSwitchTab}
            />);
        })
        }
        <div
          className={buildClassName(
            'LeftColumn-menu-tab-indicator',
            !isChatListContent && 'tab-indicator-hidden',
            'tab-indicator-animating', // can be used to disable animation
          )}
          style={`
            height: ${CHAT_HEIGHT_PX * 0.6}px;
            top: ${activeChatFolder * CHAT_HEIGHT_PX + CHAT_HEIGHT_PX * 0.2}px;
          `}
        ></div>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const {
      chatFolders: {
        byId: chatFoldersById,
        orderedIds: orderedFolderIds,
        invites: folderInvitesById,
      },
    } = global;
    const { activeChatFolder } = selectTabState(global);

    return {
      chatFoldersById,
      folderInvitesById,
      orderedFolderIds,
      activeChatFolder,
      maxFolders: selectCurrentLimit(global, 'dialogFilters'),
      maxFolderInvites: selectCurrentLimit(global, 'chatlistInvites'),
      maxChatLists: selectCurrentLimit(global, 'chatlistJoined'),
    }
  }
)(FoldersMenu)
);
