import { useState } from '../../../../lib/teact/teact';
import { getActions } from '../../../../global';

import type { ApiAttachment, ApiMessage } from '../../../../api/types';

import { canReplaceMessageMedia, getAttachmentMediaType } from '../../../../global/helpers';
import { MEMO_EMPTY_ARRAY } from '../../../../util/memo';
import buildAttachment from '../helpers/buildAttachment';

import useLastCallback from '../../../../hooks/useLastCallback';
import useOldLang from '../../../../hooks/useOldLang';

export default function useAttachmentModal({
  attachments,
  fileSizeLimit,
  setAttachments,
  chatId,
  canSendAudios,
  canSendVideos,
  canSendPhotos,
  canSendDocuments,
  insertNextText,
  editedMessage,
}: {
  attachments: ApiAttachment[];
  fileSizeLimit: number;
  setAttachments: (attachments: ApiAttachment[]) => void;
  chatId: string;
  canSendAudios?: boolean;
  canSendVideos?: boolean;
  canSendPhotos?: boolean;
  canSendDocuments?: boolean;
  insertNextText: VoidFunction;
  editedMessage: ApiMessage | undefined;
}) {
  const lang = useOldLang();
  const { openLimitReachedModal, showAllowedMessageTypesNotification, showNotification } = getActions();
  const [shouldForceAsFile, setShouldForceAsFile] = useState<boolean>(false);
  const [shouldForceCompression, setShouldForceCompression] = useState<boolean>(false);
  const [shouldSuggestCompression, setShouldSuggestCompression] = useState<boolean | undefined>(undefined);

  const handleClearAttachments = useLastCallback(() => {
    setAttachments(MEMO_EMPTY_ARRAY);
    insertNextText();
  });

  const handleSetAttachments = useLastCallback(
    (newValue: ApiAttachment[] | ((current: ApiAttachment[]) => ApiAttachment[])) => {
      const newAttachments = typeof newValue === 'function' ? newValue(attachments) : newValue;
      if (!newAttachments.length) {
        handleClearAttachments();
        return;
      }

      if (newAttachments.some((attachment) => {
        const type = getAttachmentMediaType(attachment);

        return (type === 'audio' && !canSendAudios && !canSendDocuments)
          || (type === 'video' && !canSendVideos && !canSendDocuments)
          || (type === 'photo' && !canSendPhotos && !canSendDocuments)
          || (type === 'file' && !canSendDocuments);
      })) {
        showAllowedMessageTypesNotification({ chatId });
      } else if (newAttachments.some(({ size }) => size > fileSizeLimit)) {
        openLimitReachedModal({
          limit: 'uploadMaxFileparts',
        });
      } else {
        setAttachments(newAttachments);
        const shouldForce = newAttachments.some((attachment) => {
          const type = getAttachmentMediaType(attachment);

          return (type === 'audio' && !canSendAudios)
            || (type === 'video' && !canSendVideos)
            || (type === 'photo' && !canSendPhotos);
        });

        setShouldForceAsFile(Boolean(shouldForce && canSendDocuments));
        setShouldForceCompression(!canSendDocuments);
      }
    },
  );

  const handleAppendFiles = useLastCallback(async (files: File[], isSpoiler?: boolean) => {
    if (editedMessage) {
      const newAttachment = await buildAttachment(files[0].name, files[0]);
      const canReplace = editedMessage && canReplaceMessageMedia(editedMessage, newAttachment);

      if (editedMessage?.groupedId) {
        if (canReplace) {
          handleSetAttachments([newAttachment]);
        } else {
          showNotification({ message: lang('lng_edit_media_album_error') });
        }
      } else {
        handleSetAttachments([newAttachment]);
      }
    } else {
      const newAttachments = await Promise.all(files.map((file) => (
        buildAttachment(file.name, file, { shouldSendAsSpoiler: isSpoiler || undefined })
      )));
      handleSetAttachments([...attachments, ...newAttachments]);
    }
  });

  const handleFileSelect = useLastCallback(async (files: File[], suggestCompression?: boolean) => {
    if (editedMessage) {
      const newAttachment = await buildAttachment(files[0].name, files[0]);
      const canReplace = editedMessage && canReplaceMessageMedia(editedMessage, newAttachment);

      if (editedMessage?.groupedId) {
        if (canReplace) {
          handleSetAttachments([newAttachment]);
        } else {
          showNotification({ message: lang('lng_edit_media_album_error') });
        }
      } else {
        handleSetAttachments([newAttachment]);
      }
    } else {
      const newAttachments = await Promise.all(files.map((file) => buildAttachment(file.name, file)));
      handleSetAttachments(newAttachments);
    }
    setShouldSuggestCompression(suggestCompression);
  });

  return {
    shouldSuggestCompression,
    handleAppendFiles,
    handleFileSelect,
    handleClearAttachments,
    handleSetAttachments,
    shouldForceCompression,
    shouldForceAsFile,
  };
}
