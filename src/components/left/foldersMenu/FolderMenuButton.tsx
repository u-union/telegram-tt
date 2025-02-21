import React, { FC, memo, useRef } from "../../../lib/teact/teact";

import useAppLayout from "../../../hooks/useAppLayout";
import useContextMenuHandlers from "../../../hooks/useContextMenuHandlers";
import useLastCallback from "../../../hooks/useLastCallback";
import useOldLang from "../../../hooks/useOldLang";

import { CHAT_HEIGHT_PX } from "../../../config";
import Icon from "../../common/icons/Icon";
import CustomEmoji from "../../common/CustomEmoji";
import { IconName } from "../../../types/icons";

import buildClassName from "../../../util/buildClassName";
import { MouseButton } from "../../../util/windowEnvironment";

import Button from "../../ui/Button";
import Menu from "../../ui/Menu";
import MenuItem from "../../ui/MenuItem";
import MenuSeparator from "../../ui/MenuSeparator";
import { MenuItemContextAction } from "../../ui/ListItem";
import { buildEmojiSrc } from "../../ui/EmojiMenu";
import { FolderDetails, FolderIconType } from "./FolderMenuHelper";

const FolderMenuButton: FC<{
  badgeCount?: number;
  contextActions?: MenuItemContextAction[];
  iconData: string;
  iconType?: FolderIconType;
  index: number;
  isActive: boolean;
  isBlocked?: boolean;
  name: string;
  onClick: (index: number) => void;
}> = ({ badgeCount, contextActions, iconData, iconType, index, isActive, isBlocked, name, onClick }) => {
  const { isMobile } = useAppLayout();
  const oldLang = useOldLang();
  const buttonRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    contextMenuAnchor, handleContextMenu, handleBeforeContextMenu, handleContextMenuClose,
    handleContextMenuHide, isContextMenuOpen,
  } = useContextMenuHandlers(buttonRef, !contextActions);

  const handleMouseDownFolderItem = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === MouseButton.Secondary) {
      handleBeforeContextMenu(e);
    }
  });

  return (
    <div
      ref={buttonRef}
      className="LeftColumn-menu-item"
      style={`height: ${CHAT_HEIGHT_PX}px; min-height: ${CHAT_HEIGHT_PX}px;`}
      onMouseDown={handleMouseDownFolderItem}
      onContextMenu={handleContextMenu}
    >
      <Button
        className={buildClassName(isActive && 'button-active')}
        ripple={!isMobile}
        color="translucent"
        onClick={() => onClick(index)}
        ariaLabel={oldLang('lng_settings_information')}
      >
        {renderFolderIcon({ data: iconData, type: iconType })}
        <span className={buildClassName("folderName", isMobile && "hideText")} >{name}</span>
      </Button>

      {isBlocked ? <Icon name="lock-badge" className="badge" /> :
        !!badgeCount && <span className="badge">{badgeCount}</span>}

      {contextActions && contextMenuAnchor !== undefined && (
        <Menu
          ref={menuRef}
          isOpen={isContextMenuOpen}
          anchor={contextMenuAnchor}
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
          autoClose
          withPortal
          getTriggerElement={useLastCallback(() => buttonRef.current)}
          getMenuElement={useLastCallback(() => menuRef.current)}
          getRootElement={useLastCallback(() => buttonRef.current)}
          getLayout={useLastCallback(() => ({ withPortal: true, extraMarginTop: -100 }))}
        >
          {contextActions.map((action) => (
            ('isSeparator' in action) ? (
              <MenuSeparator key={action.key || 'separator'} />
            ) : (
              <MenuItem
                key={action.title}
                icon={action.icon}
                destructive={action.destructive}
                disabled={!action.handler}
                onClick={action.handler}
              >
                {action.title}
              </MenuItem>
            )
          ))}
        </Menu>
      )}
    </div>
  )
}

export default memo(FolderMenuButton);

export const renderFolderIcon = useLastCallback((folderDetails: FolderDetails) => {
  switch (folderDetails.type) {
    case 'icon':
      return <Icon name={folderDetails.data as IconName} className="folderIcon" />;
    case 'emoji':
      return <img src={buildEmojiSrc(folderDetails.data || '')} className="folderEmoji" />;
    case 'custom-emoji':
      return <CustomEmoji documentId={folderDetails.data || ''} className="folderCustomEmoji" size={36} />;
    default:
      return undefined;
  }
});