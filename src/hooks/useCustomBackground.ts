import { useEffect, useRef, useState } from '../lib/teact/teact';
import { getActions } from '../global';

import type { ThemeKey } from '../types';

import { CUSTOM_BG_CACHE_NAME, DARK_THEME_PATTERN_COLOR, DEFAULT_PATTERN_COLOR } from '../config';
import * as cacheApi from '../util/cacheApi';
import { preloadImage } from '../util/files';
import { debounce } from '../util/schedulers';
import { renderPatternToCanvas } from '../components/ui/WallpaperPatternRenderer';

const useCustomBackground = (theme: ThemeKey, settingValue?: string, isPattern?: boolean, isDark?: boolean, scale?: number) => {
  const { setThemeSettings } = getActions();
  const [value, setValue] = useState(settingValue);
  const blobRef = useRef<Blob>();

  useEffect(() => {
    if (!settingValue) {
      setThemeSettings({
        theme,
        background: undefined,
        backgroundColor: undefined,
        patternColor: theme === 'dark' ? DARK_THEME_PATTERN_COLOR : DEFAULT_PATTERN_COLOR,
      });
    }

    if (settingValue?.startsWith('#')) {
      setValue(settingValue);
    } else {
      setValue(undefined);
      cacheApi.fetch(CUSTOM_BG_CACHE_NAME, theme, cacheApi.Type.Blob)
        .then(async (blob) => {
          if (isPattern) {
            blobRef.current = blob;
            const patternUrl = URL.createObjectURL(blob);
            const canvas = await renderPatternToCanvas(
              patternUrl,
              window.innerWidth,
              window.innerHeight,
              { scale: scale, isMask: isDark }
            );
            const dataUrl = canvas.toDataURL();
            setValue(`url(${dataUrl})`);
          } else {
            const url = URL.createObjectURL(blob);
            await preloadImage(url)
            setValue(`url(${url})`);
          }
        })
        .catch(() => {
          setThemeSettings({
            theme,
            background: undefined,
            backgroundColor: undefined,
            patternColor: theme === 'dark' ? DARK_THEME_PATTERN_COLOR : DEFAULT_PATTERN_COLOR,
          });
        });
    }
  }, [settingValue, theme, isDark, scale]);

  // Resize pattern background
  window.onresize = () => {
    debouncedResize();
  };
  const debouncedResize = debounce(() => {
    if (isPattern) {
      if (blobRef.current) {
        setValue(undefined);
        const patternUrl = URL.createObjectURL(blobRef.current);
        renderPatternToCanvas(patternUrl, window.innerWidth, window.innerHeight)
          .then((canvas) => {
            const dataUrl = canvas.toDataURL();
            setValue(`url(${dataUrl})`);
          });
      }
    };
  }, 1000, false);


  return settingValue ? value : undefined;
};

export default useCustomBackground;
