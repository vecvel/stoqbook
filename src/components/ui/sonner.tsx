import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !bg-white !text-stone-800 !border !border-stone-200 !shadow-lg !rounded-xs",
          title: "!text-stone-800 !font-semibold !text-sm",
          description: "!text-stone-500 !text-sm",
          actionButton: "!bg-burgundy !text-white !rounded-xs !text-xs !font-medium",
          cancelButton: "!bg-stone-100 !text-stone-600 !rounded-xs !text-xs",
          closeButton: "!bg-stone-100 !text-stone-500 !border-stone-200",
          icon: "!text-burgundy",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
