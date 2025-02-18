import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useRef,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiWallpaper } from '../../../api/types';
import type { ThemeKey } from '../../../types';
import { SettingsScreens, UPLOADING_WALLPAPER_SLUG } from '../../../types';

import { DARK_THEME_BG_COLOR, DARK_THEME_PATTERN_COLOR, DEFAULT_PATTERN_COLOR, LIGHT_THEME_BG_COLOR } from '../../../config';
import { selectTheme } from '../../../global/selectors';
import { getAverageColor, getPatternColor, rgb2hex } from '../../../util/colors';
import { validateFiles } from '../../../util/files';
import { throttle } from '../../../util/schedulers';
import { openSystemFilesDialog } from '../../../util/systemFilesDialog';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useOldLang from '../../../hooks/useOldLang';
import useLastCallback from '../../../hooks/useLastCallback';

import RangeSlider from '../../ui/RangeSlider';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import Loading from '../../ui/Loading';
import WallpaperTile from './WallpaperTile';
import { getColorsFromWallPaper } from '../../ui/WallpaperPatternRenderer';

import './SettingsGeneralBackground.scss';

type OwnProps = {
  isActive?: boolean;
  onScreenSelect: (screen: SettingsScreens) => void;
  onReset: () => void;
};

type StateProps = {
  background?: string;
  blurSize?: number;
  isPattern?: boolean;
  isDark?: boolean;
  scale?: number;
  loadedWallpapers?: ApiWallpaper[];
  theme: ThemeKey;
};

const SUPPORTED_TYPES = 'image/jpeg';

const patternScaleOptionStrings = ['Small', 'Medium', 'Large'];
const patternScaleOptionValues = [0.75, 1, 1.25];

const runThrottled = throttle((cb) => cb(), 60000, true);

const SettingsGeneralBackground: FC<OwnProps & StateProps> = ({
  isActive,
  onScreenSelect,
  onReset,
  background,
  blurSize,
  isPattern,
  isDark,
  scale,
  loadedWallpapers,
  theme,
}) => {
  const {
    loadWallpapers,
    uploadWallpaper,
    setThemeSettings,
  } = getActions();

  const themeRef = useRef<ThemeKey>(theme);
  const lang = useOldLang();

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  // Due to the parent Transition, this component never gets unmounted,
  // that's why we use throttled API call on every update.
  useEffect(() => {
    if (isActive) {
      loadWallpapers();
    }
  }, [isActive]);

  const handleFileSelect = useLastCallback((e: Event) => {
    const { files } = e.target as HTMLInputElement;

    const validatedFiles = validateFiles(files);
    if (validatedFiles?.length) {
      uploadWallpaper(validatedFiles[0]);
    }
  });

  const handleUploadWallpaper = useLastCallback(() => {
    openSystemFilesDialog(SUPPORTED_TYPES, handleFileSelect, true);
  });

  const handleSetColor = useLastCallback(() => {
    onScreenSelect(SettingsScreens.GeneralChatBackgroundColor);
  });

  const handleWallPaperBlurChange = useLastCallback((value: number) => {
    setThemeSettings({ theme: themeRef.current!, blurSize: value });
  });

  const handleLightDarkChange = useLastCallback((value: boolean) => {
    setThemeSettings({ theme: themeRef.current!, isDark: value });
  });

  const handlePatternScaleChange = useLastCallback((value: number) => {
    setThemeSettings({ theme: themeRef.current!, scale: patternScaleOptionValues[value] });
  });

  const handleResetToDefault = useLastCallback(() => {
    setThemeSettings({
      theme,
      background: undefined,
      backgroundColor: undefined,
      patternColor: theme === 'dark' ? DARK_THEME_PATTERN_COLOR : DEFAULT_PATTERN_COLOR,
    });
  });

  const handleWallPaperSelect = useLastCallback((slug: string) => {
    setThemeSettings({ theme: themeRef.current!, background: slug });
    const currentWallpaper = loadedWallpapers && loadedWallpapers.find((wallpaper) => wallpaper.slug === slug);
    
    if (currentWallpaper?.pattern) {
      const backgroundColor = theme === 'dark' ? DARK_THEME_BG_COLOR : LIGHT_THEME_BG_COLOR;
      const patternColor = theme === 'dark' ? DARK_THEME_PATTERN_COLOR : DEFAULT_PATTERN_COLOR;
      setThemeSettings({
        theme: themeRef.current!,
        backgroundColor: backgroundColor,
        patternColor,
        isPattern: true,
        colors: getColorsFromWallPaper(currentWallpaper),
        isDark
      });
    } else {
      if (!currentWallpaper?.document.thumbnail) return;
      getAverageColor(currentWallpaper.document.thumbnail.dataUri)
        .then((color) => {
          const patternColor = getPatternColor(color);
          const rgbColor = `#${rgb2hex(color)}`;
          setThemeSettings({
            theme: themeRef.current!,
            backgroundColor: rgbColor,
            patternColor,
            isPattern: false,
          });
        });
    }
  });

  const isUploading = loadedWallpapers?.[0] && loadedWallpapers[0].slug === UPLOADING_WALLPAPER_SLUG;

  return (
    <div className="SettingsGeneralBackground settings-content custom-scroll">
      <div className="settings-item pt-3">
        <ListItem
          icon="camera-add"
          className="mb-0"
          disabled={isUploading}
          onClick={handleUploadWallpaper}
        >
          {lang('UploadImage')}
        </ListItem>

        <ListItem
          icon="colorize"
          className="mb-0"
          onClick={handleSetColor}
        >
          {lang('SetColor')}
        </ListItem>

        <ListItem icon="favorite" onClick={handleResetToDefault}>
          {lang('ThemeResetToDefaults')}
        </ListItem>

        <Checkbox
          label={'Invert mask'} // todo: add lang here
          checked={isDark}
          disabled={!isPattern}
          onCheck={handleLightDarkChange}
        />

        <RangeSlider
          className='no-swipe'
          value={patternScaleOptionValues.indexOf(scale || 1)}
          onChange={handlePatternScaleChange}
          options={patternScaleOptionStrings}
          disabled={!isPattern || !background}
        />

        <RangeSlider
          className='no-swipe'
          label={'Blur'} // todo: add lang here
          value={blurSize || 0}
          onChange={handleWallPaperBlurChange}
          min={0}
          max={100}
          disabled={isPattern || !background}
        />
      </div>

      {loadedWallpapers ? (
        <div className="settings-wallpapers">
          {loadedWallpapers
            .map((wallpaper) => {
            const colors = getColorsFromWallPaper(wallpaper);
            if (wallpaper.pattern && !colors) return undefined;
            return (
              <WallpaperTile
                key={wallpaper.slug}
                wallpaper={wallpaper}
                theme={theme}
                isSelected={background === wallpaper.slug}
                onClick={handleWallPaperSelect}
              />
            );
          })}
        </div>
      ) : (
        <Loading />
      )}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const theme = selectTheme(global);
    const { background, blurSize, isPattern, isDark, scale } = global.settings.themes[theme] || {};
    const { loadedWallpapers } = global.settings;

    return {
      background,
      blurSize,
      isPattern,
      isDark,
      scale,
      loadedWallpapers,
      theme,
    };
  },
)(SettingsGeneralBackground));
