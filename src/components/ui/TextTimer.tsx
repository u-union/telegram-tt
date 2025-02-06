import React, { type FC, memo, useEffect } from '../../lib/teact/teact';

import { formatMediaDuration } from '../../util/dates/dateFormat';
import { getServerTime } from '../../util/serverTime';

import useInterval from '../../hooks/schedulers/useInterval';
import useForceUpdate from '../../hooks/useForceUpdate';
import useOldLang from '../../hooks/useOldLang';

export type TextTimerDetails = {
  langKey: string;
  endsAt: number;
};

type OwnProps = {
  details: TextTimerDetails;
  onEnd?: NoneToVoidFunction;
};

const UPDATE_FREQUENCY = 500; // Sometimes second gets skipped if using 1000

const TextTimer: FC<OwnProps> = ({ details, onEnd }) => {
  const { langKey, endsAt } = details;
  
  const lang = useOldLang();
  const forceUpdate = useForceUpdate();

  const serverTime = getServerTime();
  const isActive = serverTime < endsAt;
  useInterval(forceUpdate, isActive ? UPDATE_FREQUENCY : undefined);

  useEffect(() => {
    if (!isActive) {
      onEnd?.();
    }
  }, [isActive, onEnd]);

  if (!isActive) return undefined;

  const timeLeft = endsAt - serverTime;
  const formattedTime = formatMediaDuration(timeLeft);

  return (
    <span>
      {lang(langKey, formattedTime)}
    </span>
  );
};

export default memo(TextTimer);
