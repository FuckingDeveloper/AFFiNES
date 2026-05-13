import { TypeConfirmDialog } from '../../../components/shared/type-confirm-dialog';

export const DeleteAccountDialog = ({
  email,
  open,
  onClose,
  onDelete,
  onOpenChange,
}: {
  email: string;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <TypeConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Удалить аккаунт?"
      description={
        <>
          <span className="font-bold">{email}</span> будет удалён безвозвратно.
          Это действие нельзя отменить.
        </>
      }
      targetText={email}
      inputPlaceholder="Введите email для подтверждения"
      confirmText="Удалить"
      confirmButtonVariant="destructive"
      onConfirm={onDelete}
      onClose={onClose}
    />
  );
};
