import { buttonVariants } from '@affine/admin/components/ui/button';
import { Separator } from '@affine/admin/components/ui/separator';
import { cn } from '@affine/admin/utils';
import { ChevronRightIcon, MailWarningIcon } from 'lucide-react';

type Channel = 'stable' | 'canary' | 'beta' | 'internal';

const appNames = {
  stable: BUILD_CONFIG.productName,
  canary: `${BUILD_CONFIG.productName} Canary`,
  beta: `${BUILD_CONFIG.productName} Beta`,
  internal: `${BUILD_CONFIG.productName} Internal`,
} satisfies Record<Channel, string>;
const appName = appNames[BUILD_CONFIG.appBuildType];

const links = [
  {
    href: `mailto:${BUILD_CONFIG.supportEmail}`,
    icon: <MailWarningIcon size={20} />,
    label: 'Поддержка',
  },
];

export function AboutAFFiNE() {
  return (
    <div className="flex flex-col h-full gap-3 py-5 px-6 w-full">
      <div className="flex items-center">
        <span className="text-xl font-semibold">
          О {BUILD_CONFIG.productName}
        </span>
      </div>
      <div className="overflow-y-auto space-y-[10px]">
        <div className="flex flex-col rounded-md border">
          {links.map(({ href, icon, label }, index) => (
            <div key={label + index}>
              <a
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'justify-between cursor-pointer w-full'
                )}
                href={href}
                target="_blank"
                rel="noreferrer"
              >
                <div className="flex items-center gap-3">
                  {icon}
                  <span>{label}</span>
                </div>
                <div>
                  <ChevronRightIcon size={20} />
                </div>
              </a>
              {index < links.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 text-sm font-normal text-muted-foreground">
        <div>{`Версия приложения: ${appName} ${BUILD_CONFIG.displayVersion}`}</div>
        <div>{`Версия редактора: ${BUILD_CONFIG.editorVersion}`}</div>
      </div>
    </div>
  );
}
