"use client";

import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUp,
  Paperclip,
  Square,
  X,
  StopCircle,
  Mic,
  BrainCog,
  AudioLines,
  ChevronDown,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { cn } from "@/lib/utils";
import { VoiceInput } from "@/components/ui/voice-input";

// Embedded CSS for minimal custom styles (injected once on mount).
const styles = `
  *:focus-visible {
    outline-offset: 0 !important;
    --ring-offset: 0 !important;
  }
  textarea::-webkit-scrollbar {
    width: 6px;
  }
  textarea::-webkit-scrollbar-track {
    background: transparent;
  }
  textarea::-webkit-scrollbar-thumb {
    background-color: #444444;
    border-radius: 3px;
  }
  textarea::-webkit-scrollbar-thumb:hover {
    background-color: #555555;
  }
`;

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-base text-gray-100 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed min-h-[44px] resize-none",
      className,
    )}
    ref={ref}
    rows={1}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// Tooltip Components
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-[#333333] bg-[#1F2023] px-3 py-1.5 text-sm text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Dialog Components
const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border border-[#333333] bg-[#1F2023] p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-[#2E3033]/80 p-2 hover:bg-[#2E3033] transition-all">
        <X className="h-5 w-5 text-gray-200 hover:text-white" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight text-gray-100", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses = {
      default: "bg-white hover:bg-white/80 text-black",
      outline: "border border-[#444444] bg-transparent hover:bg-[#3A3A40]",
      ghost: "bg-transparent hover:bg-[#3A3A40]",
    };
    const sizeClasses = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-sm",
      lg: "h-12 px-6",
      icon: "h-8 w-8 rounded-full aspect-[1/1]",
    };
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

// VoiceRecorder Pill — compact "recording" indicator shown while the composer
// mic is capturing, since the textarea stays visible to show live dictation.
interface VoiceRecorderProps {
  time: number;
}
const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ time }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  return (
    <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
      <span className="font-mono text-[11px] text-red-400">{formatTime(time)}</span>
      <span className="text-[11px] text-white/60">Recording…</span>
    </div>
  );
};

// ImageViewDialog Component
interface ImageViewDialogProps {
  imageUrl: string | null;
  onClose: () => void;
}
const ImageViewDialog: React.FC<ImageViewDialogProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] border-none bg-transparent p-0 shadow-none md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative overflow-hidden rounded-2xl bg-[#1F2023] shadow-2xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Full preview"
            className="max-h-[80vh] w-full rounded-2xl object-contain"
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

// PromptInput Context and Components
interface PromptInputContextType {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
}
const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
});
function usePromptInput() {
  const context = React.useContext(PromptInputContext);
  if (!context) throw new Error("usePromptInput must be used within a PromptInput");
  return context;
}

interface PromptInputProps {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}
const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      className,
      isLoading = false,
      maxHeight = 240,
      value,
      onValueChange,
      onSubmit,
      children,
      disabled = false,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(value || "");
    const handleChange = (newValue: string) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    };
    return (
      <TooltipProvider>
        <PromptInputContext.Provider
          value={{
            isLoading,
            value: value ?? internalValue,
            setValue: onValueChange ?? handleChange,
            maxHeight,
            onSubmit,
            disabled,
          }}
        >
          <div
            ref={ref}
            className={cn(
              "relative rounded-3xl border border-[#444444] bg-[#1F2023] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-all duration-300",
              isLoading && "border-red-500/70",
              className,
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    );
  },
);
PromptInput.displayName = "PromptInput";

interface PromptInputTextareaProps {
  disableAutosize?: boolean;
  placeholder?: string;
  /** Arrow/Enter/Escape keys are consumed by the slash-command menu. */
  onSlashKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

/** A tool offered as a slash command (from GET /api/tools). */
interface SlashTool {
  name: string;
  description: string;
}

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps & Omit<React.ComponentProps<typeof Textarea>, "ref">
>(
  (
    {
      className,
      onKeyDown,
      disableAutosize = false,
      placeholder,
      onSlashKeyDown,
      ...props
    },
    ref,
  ) => {
    const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput();
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    React.useEffect(() => {
      if (disableAutosize || !textareaRef.current) return;
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        typeof maxHeight === "number"
          ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
          : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`;
    }, [value, maxHeight, disableAutosize]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // The slash-command menu gets first refusal on the keys it uses.
      if (onSlashKeyDown?.(e)) return;
      // Don't submit mid-composition (IME) or while a modifier is held.
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        onSubmit?.();
      }
      onKeyDown?.(e);
    };

    return (
      <Textarea
        ref={setRefs}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn("text-base", className)}
        disabled={disabled}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);
PromptInputTextarea.displayName = "PromptInputTextarea";

const PromptInputActions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

interface PromptInputActionProps extends React.ComponentProps<typeof Tooltip> {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}
const PromptInputAction: React.FC<PromptInputActionProps> = ({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}) => {
  const { disabled } = usePromptInput();
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

// Custom Divider Component
const CustomDivider: React.FC = () => (
  <div className="relative mx-1 h-6 w-[1.5px]">
    <div
      className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-[#9b87f5]/70 to-transparent"
      style={{
        clipPath:
          "polygon(0% 0%, 100% 0%, 100% 40%, 140% 50%, 100% 60%, 100% 100%, 0% 100%, 0% 60%, -40% 50%, 0% 40%)",
      }}
    />
  </div>
);

// Main PromptInputBox Component — extended with Ultron's existing voice controls.
export interface VoiceOption {
  key: string;
  name: string;
  accent: string;
  engine: string;
  gender: string;
  note?: string;
}

/**
 * Custom voice picker. A native <select> can't show accent, gender or the
 * voice's character, and can't be themed; this replaces it with a themed
 * listbox that does, with full keyboard support.
 */
function VoicePicker({
  voices,
  voiceKey,
  onChange,
}: {
  voices: VoiceOption[];
  voiceKey?: string;
  onChange?: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // null = follow the selected voice; otherwise the keyboard/hover cursor.
  const [cursor, setCursor] = React.useState<number | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedIndex = Math.max(
    0,
    voices.findIndex((v) => v.key === voiceKey),
  );
  const selected = voices[selectedIndex];
  const index = cursor ?? selectedIndex;

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-voice-index="${index}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  const commit = (i: number) => {
    const v = voices[i];
    if (!v) return;
    onChange?.(v.key);
    setOpen(false);
    setCursor(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setCursor(null);
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => ((i ?? index) + 1) % voices.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => ((i ?? index) - 1 + voices.length) % voices.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setCursor(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setCursor(null);
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select voice"
        title={selected?.note ?? "Select voice"}
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded-full border py-1 pl-2 pr-1.5 transition-colors",
          open
            ? "border-[#8B5CF6]/60 bg-[#1F2023]"
            : "border-[#2A2C31] bg-[#1F2023]/70 hover:border-[#3A3D44]",
        )}
      >
        <AudioLines className="h-3 w-3 shrink-0 text-brand-bright" />
        <span className="max-w-[76px] truncate text-[11px] font-medium text-[#D1D5DB]">
          {selected ? `${selected.name} · ${selected.accent}` : "Voice"}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-[#8b8d95] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Voices"
          className="absolute bottom-full right-0 z-50 mb-2 max-h-64 w-56 overflow-y-auto rounded-2xl border border-[#3a3b40] bg-[#242529] py-1 shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
        >
          {voices.map((v, i) => (
            <button
              key={v.key}
              type="button"
              role="option"
              aria-selected={v.key === voiceKey}
              data-voice-index={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => commit(i)}
              className={cn(
                "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                i === index ? "bg-[#8B5CF6]/15" : "hover:bg-white/5",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate text-sm text-[#c9cbd1]">{v.name}</span>
                  <span className="shrink-0 text-[10px] text-[#8b8d95]">
                    {v.accent} · {v.gender}
                  </span>
                </span>
                {v.note && (
                  <span className="line-clamp-1 text-[11px] text-[#8b8d95]">
                    {v.note}
                  </span>
                )}
              </span>
              {v.key === voiceKey && (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-bright" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Main PromptInputBox Component — extended with Ultron's existing voice controls.
interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  // Existing Ultron controls.
  listening?: boolean;
  voiceEnabled?: boolean;
  onBeginVoice?: () => void;
  onEndVoice?: () => void;
  onToggleLive?: () => void;
  voices?: VoiceOption[];
  voiceKey?: string;
  onVoiceChange?: (key: string) => void;
}
export const PromptInputBox = React.forwardRef<
  HTMLDivElement,
  PromptInputBoxProps
>((props, ref) => {
  const {
    onSend = () => {},
    isLoading = false,
    placeholder = "Type your message here...",
    className,
    disabled: externalDisabled = false,
    listening = false,
    voiceEnabled = true,
    value: externalValue,
    onValueChange: externalOnValueChange,
    onBeginVoice,
    onEndVoice,
    onToggleLive,
    voices,
    voiceKey,
    onVoiceChange,
  } = props;
  const [input, setInput] = React.useState(externalValue || "");

  // Keep the external draft and internal input in sync (voice transcription
  // writes to the controlled value from outside). Reset only when the external
  // value changes to empty after a submit.
  const value = externalValue ?? input;
  const setValue = (next: string) => {
    setInput(next);
    externalOnValueChange?.(next);
  };
  const [files, setFiles] = React.useState<File[]>([]);
  const [filePreviews, setFilePreviews] = React.useState<{ [key: string]: string }>({});
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [recTime, setRecTime] = React.useState(0);
  const [showThink, setShowThink] = React.useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const promptBoxRef = React.useRef<HTMLDivElement>(null);

  // Inject custom scrollbar styles on mount.
  React.useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  // Recording timer — tracks elapsed seconds while the external voice pipeline
  // is listening.
  React.useEffect(() => {
    if (!listening) return;
    const id = window.setInterval(() => setRecTime((t) => t + 1), 1000);
    return () => {
      window.clearInterval(id);
      setRecTime(0);
    };
  }, [listening]);

  const handleToggleThink = () => setShowThink((prev) => !prev);

  const isImageFile = (file: File) => file.type.startsWith("image/");

  const processFile = (file: File) => {
    if (!isImageFile(file)) {
      console.log("Only image files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      console.log("File too large (max 10MB)");
      return;
    }
    setFiles([file]);
    const reader = new FileReader();
    reader.onload = (e) => setFilePreviews({ [file.name]: e.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => isImageFile(file));
    if (imageFiles.length > 0) processFile(imageFiles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveFile = (index: number) => {
    const fileToRemove = files[index];
    if (fileToRemove && filePreviews[fileToRemove.name]) setFilePreviews({});
    setFiles([]);
  };

  const openImageModal = (imageUrl: string) => setSelectedImage(imageUrl);

  const handlePaste = React.useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processFile(file);
          break;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleSubmit = () => {
    if (isLoading || listening || externalDisabled) return;
    if (value.trim() || files.length > 0) {
      const messagePrefix = showThink ? "[Think: " : "";
      const formattedInput = messagePrefix ? `${messagePrefix}${value}]` : value;
      onSend(formattedInput, files);
      setValue("");
      setFiles([]);
      setFilePreviews({});
    }
  };

  /* ------------------------------------------------------------------ *
   * Slash commands: typing "/" offers the agent's tools.
   * ------------------------------------------------------------------ */
  const [tools, setTools] = React.useState<SlashTool[]>([]);
  const [dismissedQuery, setDismissedQuery] = React.useState<string | null>(null);
  const [slashSel, setSlashSel] = React.useState({ query: "", index: 0 });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const toolsLoadedRef = React.useRef(false);
  // `setValue` may be recreated every render; a ref keeps the callbacks stable.
  const setValueRef = React.useRef(setValue);
  React.useEffect(() => {
    setValueRef.current = setValue;
  });

  // Only treat it as a slash command while the "/" is still the first token and
  // nothing has been typed after it but the query.
  const slashQuery = React.useMemo(() => {
    if (!value.startsWith("/")) return null;
    if (value.includes("\n")) return null;
    const match = value.slice(1).match(/^([\w-]*)$/);
    return match ? match[1] : null;
  }, [value]);

  // Load the catalogue once, the first time a "/" is typed.
  React.useEffect(() => {
    if (slashQuery === null || toolsLoadedRef.current) return;
    toolsLoadedRef.current = true;
    let cancelled = false;
    fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : { tools: [] }))
      .then((data: { tools?: SlashTool[] }) => {
        if (!cancelled && Array.isArray(data.tools)) setTools(data.tools);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slashQuery]);

  const matches = React.useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    if (!q) return tools.slice(0, 8);
    return tools
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [tools, slashQuery]);

  // Open whenever the composer is being used as a slash command. Escape
  // dismisses the query it was open on; typing on brings it back.
  const menuOpen =
    slashQuery !== null && matches.length > 0 && dismissedQuery !== slashQuery;

  // The highlight is remembered per query, so typing filters it back to the top
  // without an effect that would re-render in a loop.
  const slashIndex =
    slashSel.query === (slashQuery ?? "") ? slashSel.index : 0;
  const setSlashIndex = React.useCallback(
    (next: number | ((i: number) => number)) => {
      setSlashSel((prev) => {
        const current = prev.query === (slashQuery ?? "") ? prev.index : 0;
        const value =
          typeof next === "function"
            ? (next as (i: number) => number)(current)
            : next;
        return { query: slashQuery ?? "", index: value };
      });
    },
    [slashQuery],
  );

  const applySlashTool = React.useCallback(
    (tool: SlashTool) => {
      setValueRef.current(`/${tool.name} `);
      setDismissedQuery(null);
      setSlashSel({ query: "", index: 0 });
      // Keep the caret in the box so the user can finish the request.
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [],
  );

  const onSlashKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!menuOpen) return false;
      if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % matches.length);
        return true;
      }
      if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + matches.length) % matches.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = matches[slashIndex] ?? matches[0];
        if (pick) applySlashTool(pick);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedQuery(slashQuery);
        return true;
      }
      return false;
    },
    [menuOpen, slashQuery, matches, slashIndex, setSlashIndex, applySlashTool],
  );

  const hasContent = value.trim() !== "" || files.length > 0;

  return (
    <>
      <PromptInput
        value={value}
        onValueChange={setValue}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className={cn(
          "w-full border-[#444444] bg-[#1F2023] shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-all duration-300 ease-in-out",
          (listening) && "border-red-500/70",
          className,
        )}
        disabled={isLoading || listening || externalDisabled}
        ref={ref || promptBoxRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length > 0 && !listening && (
          <div className="flex flex-wrap gap-2 p-0 pb-1 transition-all duration-300">
            {files.map((file, index) => (
              <div key={index} className="group relative">
                {file.type.startsWith("image/") && filePreviews[file.name] && (
                  <div
                    className="w-16 h-16 cursor-pointer overflow-hidden rounded-xl transition-all duration-300"
                    onClick={() => openImageModal(filePreviews[file.name])}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={filePreviews[file.name]}
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(index);
                      }}
                      className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {listening && <VoiceRecorder time={recTime} />}

        {menuOpen && (
          <div className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-2xl border border-[#3a3b40] bg-[#242529] shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
            <div className="border-b border-[#34353a] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#8b8d95]">
              Tools
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {matches.map((tool, i) => (
                <li key={tool.name}>
                  <button
                    type="button"
                    onMouseEnter={() => setSlashIndex(i)}
                    onClick={() => applySlashTool(tool)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
                      i === slashIndex
                        ? "bg-[#8B5CF6]/15"
                        : "hover:bg-white/5",
                    )}
                  >
                    <span className="font-mono text-sm text-[#c9cbd1]">
                      /{tool.name}
                    </span>
                    <span className="line-clamp-2 text-xs text-[#8b8d95]">
                      {tool.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="transition-all duration-300">
          <PromptInputTextarea
            placeholder={showThink ? "Think deeply..." : placeholder}
            className="text-base"
            ref={textareaRef}
            onSlashKeyDown={onSlashKeyDown}
          />
        </div>

        <PromptInputActions className="flex flex-wrap items-center justify-between gap-2 p-0 pt-2">
          <div
            className={cn(
              "flex items-center gap-1 transition-opacity duration-300",
              listening ? "invisible h-0 opacity-0" : "visible opacity-100",
            )}
          >
            <PromptInputAction tooltip="Upload image">
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#9CA3AF] transition-colors hover:bg-gray-600/30 hover:text-[#D1D5DB]"
                disabled={listening}
              >
                <Paperclip className="h-5 w-5 transition-colors" />
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0)
                      processFile(e.target.files[0]);
                    if (e.target) e.target.value = "";
                  }}
                  accept="image/*"
                />
              </button>
            </PromptInputAction>

            {/* Think toggle — mobile only so the desktop composer stays minimal */}
            <div className="flex items-center md:hidden">
              <CustomDivider />
              <button
                type="button"
                onClick={handleToggleThink}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-full border px-2 py-1 transition-all",
                  showThink
                    ? "border-[#8B5CF6] bg-[#8B5CF6]/15 text-[#8B5CF6]"
                    : "border-transparent bg-transparent text-[#9CA3AF] hover:text-[#D1D5DB]",
                )}
              >
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <motion.div
                    animate={{ rotate: showThink ? 360 : 0, scale: showThink ? 1.1 : 1 }}
                    whileHover={{ rotate: showThink ? 360 : 15, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 25 }}
                  >
                    <BrainCog className={cn("h-4 w-4", showThink ? "text-[#8B5CF6]" : "text-inherit")} />
                  </motion.div>
                </div>
                <AnimatePresence>
                  {showThink && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex-shrink-0 overflow-hidden text-xs whitespace-nowrap text-[#8B5CF6]"
                    >
                      Think
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>

          {/* Right controls: voice picker + mic pinned beside the live/send action */}
          <div className="flex items-center gap-1">
            {voices && voices.length > 0 && (
              <div className="hidden sm:flex">
                <VoicePicker
                  voices={voices}
                  voiceKey={voiceKey}
                  onChange={onVoiceChange}
                />
              </div>
            )}

            {voiceEnabled && (
              <VoiceInput
                listening={listening}
                elapsed={recTime}
                className="shrink-0"
                onPressStart={() => onBeginVoice?.()}
                onPressEnd={() => onEndVoice?.()}
              />
            )}

            <PromptInputAction
              tooltip={
                isLoading
                  ? "Stop generation"
                  : listening
                  ? "Stop recording"
                  : hasContent
                  ? "Send message"
                  : onToggleLive
                  ? "Live voice mode"
                  : "Voice message"
              }
            >
              <Button
                variant="default"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-full transition-all duration-200",
                  listening
                    ? "bg-transparent text-red-500 hover:bg-gray-600/30 hover:text-red-400"
                    : hasContent
                    ? "bg-white text-[#1F2023] hover:bg-white/80"
                    : onToggleLive
                    ? "bg-brand text-[#211d19] hover:bg-brand-bright"
                    : "bg-transparent text-[#9CA3AF] hover:bg-gray-600/30 hover:text-[#D1D5DB]",
                )}
                onClick={() => {
                  if (listening) {
                    onEndVoice?.();
                  } else if (hasContent) {
                    handleSubmit();
                  } else if (onToggleLive) {
                    onToggleLive?.();
                  } else {
                    onBeginVoice?.();
                  }
                }}
                disabled={isLoading && !hasContent}
                aria-label={
                  isLoading
                    ? "Stop generation"
                    : listening
                    ? "Stop recording"
                    : hasContent
                    ? "Send"
                    : onToggleLive
                    ? "Live voice mode"
                    : "Voice"
                }
              >
                {isLoading ? (
                  <Square className="h-4 w-4 fill-[#1F2023] animate-pulse" />
                ) : listening ? (
                  <StopCircle className="h-5 w-5 text-red-500" />
                ) : hasContent ? (
                  <ArrowUp className="h-4 w-4 text-[#1F2023]" />
                ) : onToggleLive ? (
                  <AudioLines className="h-4 w-4 text-[#211d19]" />
                ) : (
                  <Mic className="h-5 w-5 text-[#1F2023] transition-colors" />
                )}
              </Button>
            </PromptInputAction>
          </div>
        </PromptInputActions>
      </PromptInput>

      <ImageViewDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
});
PromptInputBox.displayName = "PromptInputBox";
