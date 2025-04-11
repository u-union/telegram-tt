import type { FC } from '../../lib/teact/teact';
import React, { memo, useEffect, useRef } from '../../lib/teact/teact';
import type { IconName } from '../../types/icons';

import buildClassName from '../../util/buildClassName';
import animateHorizontalScroll from '../../util/animateHorizontalScroll';

import useHorizontalScroll from '../../hooks/useHorizontalScroll';
import useAppLayout from '../../hooks/useAppLayout';
import useLastCallback from '../../hooks/useLastCallback';
import useFlag from '../../hooks/useFlag';

import Button from './Button';
import Icon from '../common/icons/Icon';

import './HorizontalTabSelector.scss';


type TabSelectorOption = {
  index: number;
  icon: IconName;
  title?: string;
};

type OwnProps = {
  className?: string;
  options: TabSelectorOption[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

const HorizontalTabSelector: FC<OwnProps> = ({
  className,
  options,
  activeIndex,
  onSelect,
}) => {
  const { isMobile } = useAppLayout();
  const [isOpen, openSelector, closeSelector] = useFlag(false);

  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const containerInnerRef = useRef<HTMLDivElement>(null);

  // Open the selector and select the first option
  const handleOpenSelector = useLastCallback(() => {
    onSelect(options[0].index);
    openSelector();
  });

  // Scroll tab on vertical scroll as well
  useHorizontalScroll(containerInnerRef, !isOpen && !isMobile);

  /**
   * Handle selector flag + scroll to active index when the active index changes
   */
  useEffect(() => {
    // If the selector is open and the active index is not in the options, close the selector
    if (isOpen && !options.find((option) => option.index === activeIndex) && containerInnerRef.current) {
      animateHorizontalScroll(containerInnerRef.current, 0, 100)
        .finally(() => {
          closeSelector();
        });
    }

    // If the selector is not open and the active index is in the options, open the selector
    if (!isOpen && !!options.find((option) => option.index === activeIndex)) {
      openSelector();
    }

    // Scroll to the active index
    if (isOpen && containerRef.current && containerInnerRef.current) {
      const selectedButton = document.querySelector('.horizontal-tab-selector-button.selected');
      if (selectedButton) {
        // Selected button position relative to viewport
        const selectedButtonRect = selectedButton.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const buttonLeft = selectedButtonRect.left - containerRect.left + containerInnerRef.current.scrollLeft;

        // Calculate the target scroll position that would center the button and clamp it
        const targetScrollLeft = buttonLeft - (containerRect.width - selectedButtonRect.width) / 2;
        const maxScroll = containerInnerRef.current.scrollWidth - containerRect.width;
        const clampedScroll = Math.max(0, Math.min(targetScrollLeft, maxScroll));

        // animateHorizontalScroll creates better animations than scrollTo
        animateHorizontalScroll(containerInnerRef.current, clampedScroll);
      }
    }
  }, [isOpen, activeIndex, options, closeSelector, openSelector]);

  return (
    <div ref={containerRef} className={buildClassName('horizontal-tab-selector', className)}>
      <div
        ref={containerInnerRef}
        className={buildClassName('horizontal-tab-selector-container', isOpen && 'expanded', 'no-scrollbar')}
      >
        {options.map((option, index) => (
          <Button
            round
            faded
            size='default'
            color="translucent"
            onClick={() => isOpen ? onSelect(option.index) : handleOpenSelector()}
            ariaLabel={option.title}
            className={
              buildClassName(
                'horizontal-tab-selector-button',
                index === 0 && 'placeholder',
                option.index === activeIndex && 'selected'
              )}
          >
            <Icon name={option.icon} />
          </Button>
        ))}
      </div>
    </div>
  );
};

export default memo(HorizontalTabSelector);
