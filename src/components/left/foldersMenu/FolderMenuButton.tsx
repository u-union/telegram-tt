import React, { FC, memo, useRef } from "../../../lib/teact/teact";

import useAppLayout from "../../../hooks/useAppLayout";
import useContextMenuHandlers from "../../../hooks/useContextMenuHandlers";
import useLastCallback from "../../../hooks/useLastCallback";

import { CHAT_HEIGHT_PX } from "../../../config";
import Icon from "../../common/icons/Icon";
import { IconName } from "../../../types/icons";

import buildClassName from "../../../util/buildClassName";
import { MouseButton } from "../../../util/windowEnvironment";

import Button from "../../ui/Button";
import Menu from "../../ui/Menu";
import MenuItem from "../../ui/MenuItem";
import MenuSeparator from "../../ui/MenuSeparator";
import { MenuItemContextAction } from "../../ui/ListItem";

const FolderMenuButton: FC<{
  badgeCount?: number;
  contextActions?: MenuItemContextAction[];
  emoji: IconName;
  isIcon?: boolean;
  index: number;
  isActive: boolean;
  isBlocked?: boolean;
  name: string;
  onClick: (index: number) => void;
}> = ({ badgeCount, contextActions, emoji, isIcon, index, isActive, isBlocked, name, onClick }) => {
  const { isMobile } = useAppLayout();
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
      // ariaLabel={oldLang('lng_settings_information')} // todo: check
      >
        { isIcon ? (<Icon className="folderIcon" name={emoji} />) : (<span className="folderEmoji">{emoji}</span>) }
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