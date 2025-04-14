import { useEffect } from '../../../lib/teact/teact';
import animateHorizontalScroll from '../../../util/animateHorizontalScroll';

/**
 * Hook to horizontally scroll a container to center the active element.
 * 
 * @param containerRef - Ref of the container to scroll.
 * @param idPrefix - Prefix for the selection IDs (e.g., "item-id-").
 * @param activeIndex - Index of the active element to center.
 */
const useCenterActiveElementHorizontally = (
  containerRef: React.RefObject<HTMLElement>,
  idPrefix: string,
  activeIndex: number
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the active element using the ID prefix and active index
    const activeElement = document.getElementById(`${idPrefix}-${activeIndex}`);
    if (!activeElement) return;

    // Calculate the target scroll position to center the active element
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeElement.getBoundingClientRect();
    const targetScrollLeft = activeRect.left - containerRect.left + container.scrollLeft - (containerRect.width / 2) + (activeRect.width / 2);

    // Animate the scroll to the target position
    animateHorizontalScroll(container, targetScrollLeft);
  }, [containerRef, idPrefix, activeIndex]);
}

export default useCenterActiveElementHorizontally;
