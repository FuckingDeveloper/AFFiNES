import { TypeConfirmDialog } from '../../../components/shared/type-confirm-dialog';

export const DisableAccountDialog = ({
  email,
  open,
  onClose,
  onDisable,
  onOpenChange,
}: {
  email: string;
  open: boolean;
  onClose: () => void;
  onDisable: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <TypeConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Отключить аккаунт?"
      description={
        <>
          Данные, связанные с <span className="font-bold">{email}</span>, будут
          удалены, и вход в систему с этим аккаунтом станет недоступен. Это
          действие нельзя отменить.
        </>
      }
      targetText={email}
      inputPlaceholder="Введите email для подтверждения"
      confirmText="Отключить"
      confirmButtonVariant="destructive"
      onConfirm={onDisable}
      onClose={onClose}
    />
  );
};
