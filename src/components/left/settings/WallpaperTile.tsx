import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useRef,
  useState,
} from '../../../lib/teact/teact';

import type { ApiWallpaper } from '../../../api/types';
import type { ThemeKey } from '../../../types';
import { UPLOADING_WALLPAPER_SLUG } from '../../../types';

import { CUSTOM_BG_CACHE_NAME } from '../../../config';
import buildClassName from '../../../util/buildClassName';
import * as cacheApi from '../../../util/cacheApi';
import { fetchBlob, uncompressTGV } from '../../../util/files';

import useAppLayout from '../../../hooks/useAppLayout';
import useCanvasBlur from '../../../hooks/useCanvasBlur';
import useMedia from '../../../hooks/useMedia';
import useMediaWithLoadProgress from '../../../hooks/useMediaWithLoadProgress';
import usePreviousDeprecated from '../../../hooks/usePreviousDeprecated';
import useShowTransitionDeprecated from '../../../hooks/useShowTransitionDeprecated';

import Icon from '../../common/icons/Icon';
import ProgressSpinner from '../../ui/ProgressSpinner';
import WallpaperPatternRenderer, { emitPatternTransition, getColorsFromWallPaper } from '../../ui/WallpaperPatternRenderer';

import './WallpaperTile.scss';

type OwnProps = {
  wallpaper: ApiWallpaper;
  theme: ThemeKey;
  isSelected: boolean;
  onClick: (slug: string) => void;
};

const WallpaperTile: FC<OwnProps> = ({
  wallpaper,
  theme,
  isSelected,
  onClick,
}) => {

  const { isMobile } = useAppLayout();
  const { slug, document } = wallpaper;
  const localMediaHash = `wallpaper${document.id!}`;
  const localBlobUrl = document.previewBlobUrl;
  const previewBlobUrl = useMedia(`${localMediaHash}?size=m`);
  const thumbRef = useCanvasBlur(document.thumbnail?.dataUri, Boolean(previewBlobUrl), true);
  const { transitionClassNames } = useShowTransitionDeprecated(
    Boolean(previewBlobUrl || localBlobUrl),
    undefined,
    undefined,
    'slow',
  );
  const isLoadingRef = useRef(false);
  const [isLoadAllowed, setIsLoadAllowed] = useState(false);
  const {
    mediaData: fullMedia, loadProgress,
  } = useMediaWithLoadProgress(localMediaHash, !isLoadAllowed);
  const wasLoadDisabled = usePreviousDeprecated(isLoadAllowed) === false;
  const { shouldRender: shouldRenderSpinner, transitionClassNames: spinnerClassNames } = useShowTransitionDeprecated(
    (isLoadAllowed && !fullMedia) || slug === UPLOADING_WALLPAPER_SLUG,
    undefined,
    wasLoadDisabled,
    'slow',
  );
  // To prevent triggering of the effect for useCallback
  const cacheKeyRef = useRef<string>();
  cacheKeyRef.current = theme;

  const handleSelect = useCallback(() => {
    (async () => {
      const blob = await fetchBlob(fullMedia!);
      await cacheApi.save(
        CUSTOM_BG_CACHE_NAME,
        cacheKeyRef.current!,
        wallpaper.pattern ? await uncompressTGV(blob) : blob
      );
      onClick(slug);
    })();
  }, [fullMedia, onClick, slug]);

  useEffect(() => {
    // If we've clicked on a wallpaper, select it when full media is loaded
    if (fullMedia && isLoadingRef.current) {
      handleSelect();
      isLoadingRef.current = false;
    }
  }, [fullMedia, handleSelect]);

  const handleClick = useCallback(() => {
    if (fullMedia) {
      handleSelect();
    } else {
      isLoadingRef.current = true;
      setIsLoadAllowed((isAllowed) => !isAllowed);
    }
  }, [fullMedia, handleSelect]);

  const className = buildClassName(
    'WallpaperTile',
    isSelected && 'selected',
  );

  return (
    <div className={className} onClick={handleClick}>
      <div className="media-inner">
        {wallpaper.pattern && (<WallpaperPatternRenderer slug={wallpaper.slug} colors={getColorsFromWallPaper(wallpaper)} />)}
        <canvas
          ref={thumbRef}
          className="thumbnail"
        />
        <img
          src={previewBlobUrl || localBlobUrl}
          className={buildClassName('full-media', transitionClassNames, wallpaper.pattern && 'is-pattern')}
          alt=""
          draggable={false}
        />
        {shouldRenderSpinner && (
          <div className={buildClassName('spinner-container', spinnerClassNames)}>
            <ProgressSpinner progress={loadProgress} onClick={handleClick} />
          </div>
        )}
      </div>
      <Icon
        name="animations"
        className={buildClassName('pattern-button', !wallpaper.pattern && 'hidden', isMobile && 'no-hover')}
        onClick={(e) => { emitPatternTransition({ wallpaperSlug: slug }); e.stopPropagation(); }}
      />
    </div>
  );
};

export default memo(WallpaperTile);
