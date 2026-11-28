import { createPortal } from "react-dom";
import { useUIStore } from "../../store/uiStore";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Highest z-index a browser honours, so toasts sit above every overlay
 *  (dialogs and palettes use z-[9000]/z-[9999]). */
const TOP_Z_INDEX = 2147483647;

const Toaster = ({ style, ...props }: ToasterProps) => {
  const theme = useUIStore((s) => s.theme);

  // Portal to <body> so no ancestor stacking context can trap the toasts
  // underneath a dialog or overlay.
  return createPortal(
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={{ zIndex: TOP_Z_INDEX, ...style }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />,
    document.body
  );
};

export { Toaster, toast };
