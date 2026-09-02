import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  exportImportResults,
  getValidUsersToImport,
  ImportStatus,
  type ParsedUser,
  processCSVFile,
  validateUsers,
} from '../../utils/csv-utils';
import {
  useImportUsers,
  type UserImportReturnType,
} from '../use-user-management';

export interface ImportUsersStateProps {
  passwordLimits: {
    minLength: number;
    maxLength: number;
  };
  onClose: () => void;
}

export function useImportUsersState({
  passwordLimits,
  onClose,
}: ImportUsersStateProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isFormatError, setIsFormatError] = useState(false);
  const importUsers = useImportUsers();

  // Reset all states when dialog is closed
  const resetState = useCallback(() => {
    setIsPreviewMode(false);
    setParsedUsers([]);
    setIsImporting(false);
    setIsFormatError(false);
  }, []);

  const importUsersCallback = useCallback(
    (result: UserImportReturnType) => {
      const successfulUsers = result.filter(
        (user): user is Extract<typeof user, { __typename: 'UserType' }> =>
          user.__typename === 'UserType'
      );

      const failedUsers = result.filter(
        (
          user
        ): user is Extract<
          typeof user,
          { __typename: 'UserImportFailedType' }
        > => user.__typename === 'UserImportFailedType'
      );

      const successCount = successfulUsers.length;
      const failedCount = parsedUsers.length - successCount;

      if (failedCount > 0) {
        toast.info(
          `Импортировано пользователей: ${successCount}, с ошибками: ${failedCount}`
        );
      } else {
        toast.success(`Успешно импортировано пользователей: ${successCount}`);
      }

      const successfulUserEmails = new Set(
        successfulUsers.map(user => user.email)
      );

      const failedUserErrorMap = new Map(
        failedUsers.map(user => [user.email, user.error])
      );

      setParsedUsers(prev => {
        return prev.map(user => {
          if (successfulUserEmails.has(user.email)) {
            return {
              ...user,
              importStatus: ImportStatus.Success,
            };
          }

          const errorMessage = failedUserErrorMap.get(user.email) || user.error;
          return {
            ...user,
            importStatus: ImportStatus.Failed,
            importError: errorMessage,
          };
        });
      });

      setIsImporting(false);
    },
    [parsedUsers.length]
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsImporting(true);
      try {
        await processCSVFile(
          file,
          usersFromCsv => {
            const validatedUsers = validateUsers(usersFromCsv, passwordLimits);
            setParsedUsers(validatedUsers);
            setIsPreviewMode(true);
            setIsImporting(false);
          },
          () => {
            setIsImporting(false);
            setIsFormatError(true);
          }
        );
      } catch (error) {
        console.error('Не удалось обработать файл', error);
        setIsImporting(false);
        setIsFormatError(true);
      }
    },
    [passwordLimits]
  );

  const confirmImport = useAsyncCallback(async () => {
    setIsImporting(true);
    try {
      const validUsersToImport = getValidUsersToImport(parsedUsers);

      setParsedUsers(prev =>
        prev.map(user => ({
          ...user,
          importStatus: ImportStatus.Processing,
        }))
      );

      await importUsers({ users: validUsersToImport }, importUsersCallback);
    } catch (error) {
      console.error('Не удалось импортировать пользователей', error);
      toast.error('Не удалось импортировать пользователей');
      setIsImporting(false);
    }
  }, [importUsers, importUsersCallback, parsedUsers]);

  const cancelImport = useCallback(() => {
    setIsPreviewMode(false);
    setParsedUsers([]);
  }, []);

  const resetFormatError = useCallback(() => {
    setIsFormatError(false);
  }, []);

  // Handle closing the dialog after import is complete
  const handleDone = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  // Export failed imports to CSV
  const exportResult = useCallback(() => {
    exportImportResults(parsedUsers);
  }, [parsedUsers]);

  const isImported = !!parsedUsers.some(
    user => user.importStatus && user.importStatus !== ImportStatus.Processing
  );

  const handleConfirm = useCallback(() => {
    if (isImported) {
      exportResult();
      handleDone();
    } else {
      confirmImport();
    }
  }, [confirmImport, exportResult, handleDone, isImported]);

  return {
    isImporting,
    parsedUsers,
    isPreviewMode,
    isFormatError,
    isImported,
    handleFileSelected,
    cancelImport,
    resetFormatError,
    handleConfirm,
    resetState,
  };
}
