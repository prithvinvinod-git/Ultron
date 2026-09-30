



3. model switch component :You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
ai-model-select.tsx
"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, PencilIcon } from "lucide-react"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  type HTMLMotionProps,
} from "framer-motion"
import { createPortal } from "react-dom"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* =============================================================================
 * ModelSelector — Motoko UI
 *
 * Cursor-style AI model picker: label + muted Effort/Fast/Thinking, hover Edit,
 * and a side panel for Effort / Context / Fast / Thinking.
 *
 *   <ModelSelector value={sel} onValueChange={setSel} models={models}>
 *     <ModelSelectorTrigger>
 *       <ModelSelectorValue />
 *     </ModelSelectorTrigger>
 *     <ModelSelectorContent />
 *   </ModelSelector>
 *
 *   <ModelSelectorKit value={sel} onValueChange={setSel} />
 * ============================================================================= */

// ---------------------------------------------------------------------------
// Motion tokens
// ---------------------------------------------------------------------------

const EASE = [0.2, 0, 0, 1] as const
const SPRING_SOFT = { type: "spring" as const, stiffness: 420, damping: 32 }
const SPRING_PRESS = { type: "spring" as const, stiffness: 500, damping: 28 }
const SPRING_ICON = { type: "spring" as const, duration: 0.3, bounce: 0 }

const MENU_PANEL_CLASS = cn(
  "bg-popover text-popover-foreground overflow-hidden rounded-2xl border-2 border-border p-1.5",
  "shadow-[0_8px_30px_-8px_rgba(8,8,8,0.18),0_2px_8px_-2px_rgba(8,8,8,0.08)]",
  "dark:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45),0_2px_8px_-2px_rgba(0,0,0,0.3)]"
)

type PresenceProps = Pick<
  HTMLMotionProps<"span">,
  "initial" | "animate" | "exit" | "transition"
>

const FADE_ONLY: PresenceProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const ICON_SWAP: PresenceProps = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: SPRING_ICON,
}

function scaleBlurPresence(reduceMotion: boolean): PresenceProps {
  if (reduceMotion) return FADE_ONLY
  return {
    initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
    transition: SPRING_ICON,
  }
}

function menuPresence(reduceMotion: boolean): PresenceProps {
  if (reduceMotion) return FADE_ONLY
  return {
    initial: { opacity: 0, y: 6, scale: 0.96, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, y: 4, scale: 0.98, filter: "blur(2px)" },
    transition: { duration: 0.2, ease: EASE },
  }
}

function flyoutPresence(reduceMotion: boolean): PresenceProps {
  if (reduceMotion) return FADE_ONLY
  return {
    initial: { opacity: 0, x: -6, scale: 0.98, filter: "blur(4px)" },
    animate: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, x: -4, scale: 0.98, filter: "blur(2px)" },
    transition: { duration: 0.18, ease: EASE },
  }
}

function valuePresence(reduceMotion: boolean): PresenceProps {
  return reduceMotion ? FADE_ONLY : ICON_SWAP
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE },
  },
}

const itemVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
}

// ---------------------------------------------------------------------------
// Public types & defaults
// ---------------------------------------------------------------------------

export type AiModelEffort = "high" | "medium" | "low"

export type AiModel = {
  id: string
  /** Display name, e.g. "Opus 4.5" or "Cursor Grok 4.5". */
  label: string
  description?: string
  efforts?: AiModelEffort[]
  contexts?: Array<string | number>
  supportsFast?: boolean
  supportsThinking?: boolean
  defaultEffort?: AiModelEffort
  defaultContext?: string | number
  defaultFast?: boolean
  defaultThinking?: boolean
  disabled?: boolean
}

/** Full selection: model id + per-model runtime options. */
export type AiModelSelection = {
  id: string
  effort?: AiModelEffort
  context?: string
  fast?: boolean
  thinking?: boolean
}

export const DEFAULT_AI_MODELS: AiModel[] = [
  {
    id: "opus-4.5",
    label: "Opus 4.5",
    description: "Powerful reasoning for complex coding and agentic tasks.",
    efforts: ["high", "medium", "low"],
    contexts: ["200K", "1M"],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: "high",
    defaultContext: "200K",
    defaultFast: true,
  },
  {
    id: "cursor-grok-4.5",
    label: "Cursor Grok 4.5",
    description: "Fast, capable model tuned for coding workflows.",
    efforts: ["high", "medium", "low"],
    contexts: ["128K", "256K"],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: "high",
    defaultContext: "128K",
    defaultFast: true,
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "General-purpose reasoning with strong code generation.",
    efforts: ["high", "medium", "low"],
    contexts: ["128K", "400K"],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: "medium",
    defaultContext: "128K",
  },
  {
    id: "gemini-2.5",
    label: "Gemini 2.5",
    description: "Long-context model for large files and repositories.",
    efforts: ["high", "medium", "low"],
    contexts: ["1M"],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: "low",
    defaultContext: "1M",
    defaultFast: true,
  },
]

const EFFORT_LABEL: Record<AiModelEffort, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
}

export interface ModelSelectorProps {
  children: React.ReactNode
  models?: AiModel[]
  value?: AiModelSelection
  defaultValue?: AiModelSelection
  onValueChange?: (value: AiModelSelection) => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

export interface ModelSelectorTriggerProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  children?: React.ReactNode
}

export type ModelSelectorValueProps = React.HTMLAttributes<HTMLSpanElement>

export interface ModelSelectorContentProps extends Omit<
  HTMLMotionProps<"div">,
  "children"
> {
  children?: React.ReactNode
  side?: "top" | "bottom"
}

export interface ModelSelectorKitProps {
  models?: AiModel[]
  value?: AiModelSelection
  defaultValue?: AiModelSelection
  onValueChange?: (value: AiModelSelection) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ModelSelectorContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  selection: AiModelSelection
  selectModel: (id: string) => void
  patchSelection: (patch: Partial<AiModelSelection>) => void
  models: AiModel[]
  selectedModel: AiModel | undefined
  disabled: boolean
  reduceMotion: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  contentId: string
  layoutGroupId: string
  activeIndex: number
  setActiveIndex: (index: number) => void
  optionIds: string[]
  ariaLabel: string
  side: "top" | "bottom"
  setSide: (side: "top" | "bottom") => void
  editingId: string | null
  setEditingId: (id: string | null) => void
  previewId: string | null
  setPreviewId: (id: string | null) => void
  getConfigFor: (model: AiModel) => AiModelSelection
}

function optionDomId(contentId: string, modelId: string) {
  return `${contentId}-option-${modelId}`
}

function firstEnabledIndex(models: AiModel[], optionIds: string[]) {
  for (let i = 0; i < optionIds.length; i++) {
    const model = models.find((m) => m.id === optionIds[i])
    if (model && !model.disabled) return i
  }
  return 0
}

function lastEnabledIndex(models: AiModel[], optionIds: string[]) {
  for (let i = optionIds.length - 1; i >= 0; i--) {
    const model = models.find((m) => m.id === optionIds[i])
    if (model && !model.disabled) return i
  }
  return Math.max(0, optionIds.length - 1)
}

const ModelSelectorContext =
  React.createContext<ModelSelectorContextValue | null>(null)

function useModelSelectorContext(component: string): ModelSelectorContextValue {
  const ctx = React.useContext(ModelSelectorContext)
  if (!ctx) {
    throw new Error(`${component} must be used within <ModelSelector>`)
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function assignRef<T>(
  node: T | null,
  ...refs: Array<React.Ref<T> | undefined>
) {
  for (const ref of refs) {
    if (typeof ref === "function") {
      ref(node)
    } else if (ref) {
      ;(ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

function usePrefersReducedMotion() {
  const [reduceMotion, setReduceMotion] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return reduceMotion
}

function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: {
  value: T | undefined
  defaultValue: T
  onChange?: (value: T) => void
}): [T, (next: T | ((prev: T) => T)) => void] {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const isControlled = value !== undefined
  const current = isControlled ? value : uncontrolled

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(current) : next
      if (!isControlled) setUncontrolled(resolved)
      onChange?.(resolved)
    },
    [isControlled, onChange, current]
  )

  return [current, setValue]
}

export function formatContext(
  context: string | number | undefined
): string | null {
  if (context === undefined || context === "") return null
  if (typeof context === "number") {
    if (context >= 1_000_000) return `${(context / 1_000_000).toFixed(0)}M`
    if (context >= 1_000) return `${Math.round(context / 1_000)}K`
    return String(context)
  }
  return String(context)
}

function defaultSelectionFor(model: AiModel): AiModelSelection {
  return {
    id: model.id,
    effort: model.defaultEffort ?? model.efforts?.[0],
    context:
      formatContext(model.defaultContext ?? model.contexts?.[0]) ?? undefined,
    fast: model.defaultFast ?? false,
    thinking: model.defaultThinking ?? false,
  }
}

function resolveSelection(
  models: AiModel[],
  value?: AiModelSelection
): AiModelSelection {
  const model = models.find((m) => m.id === value?.id) ?? models[0]
  if (!model) {
    return { id: value?.id ?? "" }
  }
  const base = defaultSelectionFor(model)
  if (!value || value.id !== model.id) return base
  return {
    id: model.id,
    effort: value.effort ?? base.effort,
    context: value.context ?? base.context,
    fast: value.fast ?? base.fast,
    thinking: value.thinking ?? base.thinking,
  }
}

/** Renders "Opus 4.5 High Fast" with muted modifiers. */
function ModelLabelParts({
  model,
  selection,
  className,
}: {
  model: AiModel | undefined
  selection: AiModelSelection
  className?: string
}) {
  if (!model) {
    return (
      <span className={cn("text-muted-foreground", className)}>Select model</span>
    )
  }

  const mods: string[] = []
  if (selection.effort) mods.push(EFFORT_LABEL[selection.effort])
  if (selection.fast) mods.push("Fast")
  if (selection.thinking) mods.push("Thinking")

  return (
    <span className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
      <span className="text-foreground truncate font-medium">{model.label}</span>
      {mods.map((mod) => (
        <span
          key={mod}
          className="text-muted-foreground/70 shrink-0 font-medium tabular-nums"
        >
          {mod}
        </span>
      ))}
    </span>
  )
}

function MenuCheckmark({
  visible,
  reduceMotion,
  className,
}: {
  visible: boolean
  reduceMotion: boolean
  className?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.span
          key="check"
          {...scaleBlurPresence(reduceMotion)}
          className={cn("flex shrink-0", className)}
        >
          <CheckIcon className="size-3.5" aria-hidden />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}

function OptionChip({
  selected,
  onClick,
  children,
  disabled,
  reduceMotion,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  reduceMotion: boolean
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={SPRING_PRESS}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium",
        "transition-[background-color,color,box-shadow,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_rgba(123,123,123,0.16)]"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      <span>{children}</span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <MenuCheckmark
          visible={selected}
          reduceMotion={reduceMotion}
          className="text-foreground"
        />
      </span>
    </motion.button>
  )
}

function ToggleChip({
  selected,
  onClick,
  children,
  reduceMotion,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  reduceMotion: boolean
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={SPRING_PRESS}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium",
        "transition-[background-color,color,box-shadow,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_rgba(123,123,123,0.2)]"
          : "text-muted-foreground/70 hover:bg-muted/70 hover:text-muted-foreground"
      )}
    >
      <span>{children}</span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <MenuCheckmark
          visible={selected}
          reduceMotion={reduceMotion}
          className="text-foreground"
        />
      </span>
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function ModelSelector({
  children,
  models = DEFAULT_AI_MODELS,
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "AI models",
}: ModelSelectorProps) {
  const reduceMotion = usePrefersReducedMotion()
  const layoutGroupId = React.useId()
  const contentId = React.useId()
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  const initial =
    defaultValue ?? (models[0] ? defaultSelectionFor(models[0]) : { id: "" })

  const [selection, setSelection] = useControllableState({
    value: valueProp,
    defaultValue: initial,
    onChange: onValueChange,
  })

  const [open, setOpenState] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })

  const [activeIndex, setActiveIndex] = React.useState(0)
  const [side, setSide] = React.useState<"top" | "bottom">("top")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [previewId, setPreviewId] = React.useState<string | null>(null)

  const optionIds = React.useMemo(() => models.map((m) => m.id), [models])

  // Cache last config per model so switching models restores options
  const configCacheRef = React.useRef<Record<string, AiModelSelection>>({})

  // Always expose a fully-resolved selection (fills effort/context/fast defaults)
  const resolved = resolveSelection(models, selection)

  React.useEffect(() => {
    if (resolved.id) configCacheRef.current[resolved.id] = resolved
  }, [resolved])

  const selectedModel = models.find((m) => m.id === resolved.id) ?? models[0]

  const getConfigFor = React.useCallback(
    (model: AiModel): AiModelSelection => {
      if (resolved.id === model.id) return resolved
      return configCacheRef.current[model.id] ?? defaultSelectionFor(model)
    },
    [resolved]
  )

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (disabled && next) return
      setOpenState(next)
      if (!next) {
        setEditingId(null)
        setPreviewId(null)
      }
    },
    [disabled, setOpenState]
  )

  const selectModel = React.useCallback(
    (id: string) => {
      const model = models.find((m) => m.id === id)
      if (!model || model.disabled) return
      const next = resolveSelection(models, { ...getConfigFor(model), id })
      setSelection(next)
      setEditingId(null)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [models, getConfigFor, setSelection, setOpen]
  )

  const patchSelection = React.useCallback(
    (patch: Partial<AiModelSelection>) => {
      setSelection((prev) => {
        const id = patch.id ?? prev.id
        const model = models.find((m) => m.id === id)
        const base = model
          ? id === prev.id
            ? resolveSelection(models, prev)
            : (configCacheRef.current[id] ?? defaultSelectionFor(model))
          : prev
        const next = resolveSelection(models, { ...base, ...patch, id })
        configCacheRef.current[id] = next
        return next
      })
    },
    [models, setSelection]
  )

  React.useEffect(() => {
    if (!open) return
    const idx = optionIds.indexOf(resolved.id)
    setActiveIndex(idx >= 0 ? idx : firstEnabledIndex(models, optionIds))
  }, [open, optionIds, resolved.id, models])

  React.useEffect(() => {
    if (!open) return

    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const inTrigger = triggerRef.current?.contains(target)
      const inContent = contentRef.current?.contains(target)
      if (!inTrigger && !inContent) setOpen(false)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        if (editingId) {
          setEditingId(null)
          return
        }
        setOpen(false)
        triggerRef.current?.focus()
        return
      }

      if (editingId || optionIds.length === 0) return

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const delta = event.key === "ArrowDown" ? 1 : -1
        setActiveIndex((prev) => {
          let next = prev
          for (let i = 0; i < optionIds.length; i++) {
            next = (next + delta + optionIds.length) % optionIds.length
            const model = models.find((m) => m.id === optionIds[next])
            if (!model?.disabled) break
          }
          return next
        })
        return
      }

      if (event.key === "Enter" || event.key === " ") {
        const target = event.target as HTMLElement | null
        if (target?.closest("[data-slot='model-selector-item']")) return
        if (target?.closest("[data-slot='model-selector-edit']")) return
        event.preventDefault()
        const id = optionIds[activeIndex]
        if (id) selectModel(id)
        return
      }

      if (event.key === "Home") {
        event.preventDefault()
        setActiveIndex(firstEnabledIndex(models, optionIds))
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        setActiveIndex(lastEnabledIndex(models, optionIds))
      }
    }

    document.addEventListener("mousedown", onPointer)
    document.addEventListener("touchstart", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("touchstart", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, setOpen, optionIds, activeIndex, models, selectModel, editingId])

  React.useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled, setOpen])

  return (
    <ModelSelectorContext.Provider
      value={{
        open,
        setOpen,
        selection: resolved,
        selectModel,
        patchSelection,
        models,
        selectedModel,
        disabled,
        reduceMotion,
        triggerRef,
        contentRef,
        contentId,
        layoutGroupId,
        activeIndex,
        setActiveIndex,
        optionIds,
        ariaLabel,
        side,
        setSide,
        editingId,
        setEditingId,
        previewId,
        setPreviewId,
        getConfigFor,
      }}
    >
      <div
        data-slot="model-selector"
        data-state={open ? "open" : "closed"}
        className={cn("relative inline-flex", className)}
      >
        {children}
      </div>
    </ModelSelectorContext.Provider>
  )
}

ModelSelector.displayName = "ModelSelector"

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const ModelSelectorTrigger = React.forwardRef<
  HTMLButtonElement,
  ModelSelectorTriggerProps
>(({ className, children, disabled, onClick, ...props }, ref) => {
  const {
    open,
    setOpen,
    triggerRef,
    contentId,
    disabled: rootDisabled,
    selectedModel,
    selection,
  } = useModelSelectorContext("ModelSelectorTrigger")

  const isDisabled = disabled || rootDisabled
  const label = selectedModel
    ? [
        selectedModel.label,
        selection.effort ? EFFORT_LABEL[selection.effort] : null,
        selection.fast ? "Fast" : null,
        selection.thinking ? "Thinking" : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "Select model"

  return (
    <motion.button
      ref={(node) => assignRef(node, ref, triggerRef)}
      type="button"
      disabled={isDisabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={contentId}
      aria-label={`Model: ${label}`}
      data-slot="model-selector-trigger"
      data-state={open ? "open" : "closed"}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || isDisabled) return
        setOpen(!open)
      }}
      whileHover={isDisabled ? undefined : { scale: 1.02, y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      transition={SPRING_PRESS}
      className={cn(
        "text-muted-foreground flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium",
        "transition-[background-color,color,box-shadow,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        open && "bg-muted text-foreground",
        className
      )}
      {...props}
    >
      {children ?? <ModelSelectorValue />}
      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="flex shrink-0"
      >
        <ChevronDownIcon className="size-3.5 opacity-60" aria-hidden />
      </motion.span>
    </motion.button>
  )
})
ModelSelectorTrigger.displayName = "ModelSelectorTrigger"

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

function ModelSelectorValue({ className, ...props }: ModelSelectorValueProps) {
  const { selectedModel, selection, reduceMotion } =
    useModelSelectorContext("ModelSelectorValue")

  return (
    <span
      data-slot="model-selector-value"
      className={cn("relative flex min-w-0 items-center", className)}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${selection.id}-${selection.effort}-${selection.fast}-${selection.thinking}`}
          {...valuePresence(reduceMotion)}
          className="flex min-w-0"
        >
          <ModelLabelParts
            model={selectedModel}
            selection={selection}
            className="text-sm"
          />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
ModelSelectorValue.displayName = "ModelSelectorValue"

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const ModelSelectorContent = React.forwardRef<
  HTMLDivElement,
  ModelSelectorContentProps
>(({ className, children, side: sideProp = "top", style, ...props }, ref) => {
  const {
    open,
    contentId,
    triggerRef,
    contentRef,
    reduceMotion,
    ariaLabel,
    setSide,
    editingId,
    previewId,
    models,
    activeIndex,
    optionIds,
  } = useModelSelectorContext("ModelSelectorContent")

  const [mounted, setMounted] = React.useState(false)
  const [coords, setCoords] = React.useState<{
    top: number
    left: number
  } | null>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    setSide(sideProp)
  }, [sideProp, setSide])

  React.useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      if (sideProp === "bottom") {
        setCoords({
          top: rect.bottom + 8,
          left: rect.left,
        })
      } else {
        setCoords({
          top: rect.top - 8,
          left: rect.left,
        })
      }
    }

    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, triggerRef, sideProp])

  if (!mounted) return null

  const list = children ?? <ModelSelectorDefaultItems />
  const editingModel = models.find((m) => m.id === editingId)
  const previewModel = models.find((m) => m.id === previewId)
  const panelModel = editingModel ?? previewModel
  const activeModelId = optionIds[activeIndex]
  const activeOptionId = activeModelId
    ? optionDomId(contentId, activeModelId)
    : undefined

  return createPortal(
    <AnimatePresence>
      {open && coords ? (
        <motion.div
          key={contentId}
          ref={(node) => assignRef(node, ref, contentRef)}
          data-slot="model-selector-content"
          data-editing={editingId ? "" : undefined}
          {...menuPresence(reduceMotion)}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            transform: sideProp === "top" ? "translateY(-100%)" : undefined,
            zIndex: 50,
            ...style,
          }}
          className={cn("flex origin-top-left items-start gap-3", className)}
          {...props}
        >
          <div
            id={contentId}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeOptionId}
            data-slot="model-selector-listbox"
            className="min-w-0"
          >
            {list}
          </div>

          <AnimatePresence initial={false}>
            {panelModel ? (
              <ModelSidePanel
                key="model-side-panel"
                model={panelModel}
                editing={!!editingModel}
              />
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
})
ModelSelectorContent.displayName = "ModelSelectorContent"

// ---------------------------------------------------------------------------
// Default list
// ---------------------------------------------------------------------------

function ModelSelectorDefaultItems() {
  const { models, layoutGroupId, reduceMotion, editingId, setPreviewId } =
    useModelSelectorContext("ModelSelectorDefaultItems")

  return (
    <LayoutGroup id={layoutGroupId}>
      <motion.ul
        role="presentation"
        variants={listVariants}
        initial={reduceMotion ? false : "hidden"}
        animate="show"
        className={cn(MENU_PANEL_CLASS, "flex min-w-64 flex-col gap-0.5")}
        onMouseLeave={() => {
          if (!editingId) setPreviewId(null)
        }}
      >
        {models.map((model) => (
          <li key={model.id} role="none">
            <ModelSelectorItem model={model} />
          </li>
        ))}
      </motion.ul>
    </LayoutGroup>
  )
}

// ---------------------------------------------------------------------------
// Stable side panel shell
// ---------------------------------------------------------------------------

function ModelSidePanel({
  model,
  editing,
}: {
  model: AiModel
  editing: boolean
}) {
  const { reduceMotion } = useModelSelectorContext("ModelSidePanel")

  return (
    <motion.aside
      data-slot="model-selector-side-panel"
      aria-label={
        editing ? `${model.label} settings` : `${model.label} details`
      }
      {...flyoutPresence(reduceMotion)}
      className={cn(MENU_PANEL_CLASS, "flex w-56 shrink-0 flex-col gap-3 p-3")}
    >
      {editing ? (
        <ModelEditPanelContent model={model} />
      ) : (
        <ModelInfoPanelContent model={model} />
      )}
    </motion.aside>
  )
}

// ---------------------------------------------------------------------------
// Hover info side panel
// ---------------------------------------------------------------------------

function ModelInfoPanelContent({ model }: { model: AiModel }) {
  const contexts = model.contexts
    ?.map((context) => formatContext(context))
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <div className="text-foreground text-sm font-semibold">{model.label}</div>
      {model.description ? (
        <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
          {model.description}
        </p>
      ) : null}
      {contexts ? (
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-muted-foreground/70 text-[10px] font-semibold tracking-wide uppercase">
            Context
          </span>
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {contexts}
          </span>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Edit side panel
// ---------------------------------------------------------------------------

function ModelEditPanelContent({ model }: { model: AiModel }) {
  const { getConfigFor, patchSelection, reduceMotion } =
    useModelSelectorContext("ModelEditPanelContent")

  const config = getConfigFor(model)
  const efforts = model.efforts ?? []
  const contexts = model.contexts ?? []

  return (
    <>
      {efforts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground/70 px-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Effort
          </div>
          <div className="flex flex-col gap-0.5">
            {efforts.map((effort) => (
              <OptionChip
                key={effort}
                selected={config.effort === effort}
                reduceMotion={reduceMotion}
                onClick={() => patchSelection({ id: model.id, effort })}
              >
                {EFFORT_LABEL[effort]}
              </OptionChip>
            ))}
          </div>
        </div>
      ) : null}

      {contexts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground/70 px-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Context
          </div>
          <div className="flex flex-col gap-0.5">
            {contexts.map((ctx) => {
              const label = formatContext(ctx) ?? String(ctx)
              return (
                <OptionChip
                  key={label}
                  selected={config.context === label}
                  reduceMotion={reduceMotion}
                  onClick={() =>
                    patchSelection({ id: model.id, context: label })
                  }
                >
                  <span className="tabular-nums">{label}</span>
                </OptionChip>
              )
            })}
          </div>
        </div>
      ) : null}

      {(model.supportsFast || model.supportsThinking) && (
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground/70 px-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Modes
          </div>
          <div className="flex flex-col gap-0.5">
            {model.supportsFast ? (
              <ToggleChip
                selected={!!config.fast}
                reduceMotion={reduceMotion}
                onClick={() =>
                  patchSelection({ id: model.id, fast: !config.fast })
                }
              >
                Fast
              </ToggleChip>
            ) : null}
            {model.supportsThinking ? (
              <ToggleChip
                selected={!!config.thinking}
                reduceMotion={reduceMotion}
                onClick={() =>
                  patchSelection({
                    id: model.id,
                    thinking: !config.thinking,
                  })
                }
              >
                Thinking
              </ToggleChip>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

function ModelSelectorItem({ model }: { model: AiModel }) {
  const {
    selection,
    selectModel,
    reduceMotion,
    layoutGroupId,
    contentId,
    activeIndex,
    setActiveIndex,
    optionIds,
    editingId,
    setEditingId,
    setPreviewId,
    getConfigFor,
    patchSelection,
  } = useModelSelectorContext("ModelSelectorItem")

  const isActive = model.id === selection.id
  const isEditing = editingId === model.id
  const optionIndex = optionIds.indexOf(model.id)
  const isHighlighted = optionIndex === activeIndex && optionIndex >= 0
  const isDisabled = !!model.disabled
  const config = getConfigFor(model)
  const optionId = optionDomId(contentId, model.id)

  const optionRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (isHighlighted) {
      optionRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [isHighlighted])

  return (
    <motion.div
      variants={reduceMotion ? itemVariantsReduced : itemVariants}
      className={cn(
        "group/item relative flex w-full items-center gap-1 rounded-xl",
        "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        isActive ? "text-foreground" : "text-muted-foreground",
        isHighlighted && !isActive && "bg-muted/50",
        isEditing && "bg-muted/80",
        isDisabled && "pointer-events-none opacity-40"
      )}
      onMouseEnter={() => {
        if (!isDisabled && optionIndex >= 0) {
          setActiveIndex(optionIndex)
          if (!editingId) setPreviewId(model.id)
        }
      }}
    >
      {isActive ? (
        <motion.span
          layoutId={`${layoutGroupId}-active`}
          className="bg-muted absolute inset-0 rounded-xl"
          transition={SPRING_SOFT}
        />
      ) : null}

      {/* Option has no nested buttons — Edit is a sibling for valid listbox a11y. */}
      <div
        ref={optionRef}
        id={optionId}
        role="option"
        aria-selected={isActive}
        aria-disabled={isDisabled || undefined}
        data-slot="model-selector-item"
        data-highlighted={isHighlighted ? "" : undefined}
        data-active={isActive ? "" : undefined}
        data-editing={isEditing ? "" : undefined}
        onClick={() => {
          if (!isDisabled) selectModel(model.id)
        }}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left",
          "transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          !isDisabled && "active:scale-[0.98]"
        )}
      >
        <span className="min-w-0 flex-1">
          <ModelLabelParts
            model={model}
            selection={config}
            className="text-sm"
          />
        </span>
        {isActive ? (
          <MenuCheckmark
            visible
            reduceMotion={reduceMotion}
            className="text-foreground"
          />
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
      </div>

      <motion.button
        type="button"
        data-slot="model-selector-edit"
        aria-label={`Edit ${model.label} settings`}
        aria-expanded={isEditing}
        disabled={isDisabled}
        onClick={(event) => {
          event.stopPropagation()
          if (isEditing) {
            setEditingId(null)
            return
          }
          // Opening edit selects this model’s config into the active selection
          // so the panel edits the live value, without closing the list.
          patchSelection({ ...config, id: model.id })
          setEditingId(model.id)
        }}
        whileTap={isDisabled ? undefined : { scale: 0.96 }}
        transition={SPRING_PRESS}
        className={cn(
          "relative z-10 mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg",
          "text-muted-foreground/70 opacity-0 transition-[opacity,background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:ring-ring/50 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none",
          "group-hover/item:opacity-100",
          (isEditing || isHighlighted) && "opacity-100",
          isEditing && "bg-accent text-foreground"
        )}
      >
        <PencilIcon className="size-3.5" aria-hidden />
      </motion.button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

function ModelSelectorKit({
  models = DEFAULT_AI_MODELS,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: ModelSelectorKitProps) {
  return (
    <ModelSelector
      models={models}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      <ModelSelectorTrigger>
        <ModelSelectorValue />
      </ModelSelectorTrigger>
      <ModelSelectorContent />
    </ModelSelector>
  )
}
ModelSelectorKit.displayName = "ModelSelectorKit"

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorValue,
  ModelSelectorContent,
  ModelSelectorKit,
  defaultSelectionFor,
}

export default ModelSelectorKit


demo.tsx
"use client"

import * as React from "react"

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
  ModelSelectorValue,
  type AiModelSelection,
} from "@/components/ui/ai-model-select"

// ONLY DEFAULT EXPORT WILL BE TREATED AS A DEMO
export default function DemoOne() {
  const [selection, setSelection] = React.useState<AiModelSelection>({
    id: "opus-4.5",
    effort: "high",
    context: "200K",
    fast: true,
    thinking: false,
  })

  const summary = [
    selection.id,
    selection.effort,
    selection.fast ? "fast" : null,
    selection.thinking ? "thinking" : null,
    selection.context,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex w-full max-w-lg flex-col items-center justify-center gap-6 px-2 py-10">
      <ModelSelector value={selection} onValueChange={setSelection}>
        <ModelSelectorTrigger className="bg-muted min-h-10 rounded-2xl border-2 border-border px-3 py-2">
          <ModelSelectorValue className="text-sm" />
        </ModelSelectorTrigger>
        <ModelSelectorContent side="bottom" />
      </ModelSelector>
      <p className="text-muted-foreground text-center text-xs tabular-nums">
        {summary}
      </p>
    </div>
  )
}

```

Install NPM dependencies:
```bash
clsx, lucide-react, framer-motion, tailwind-merge
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them

---

# Ultron agent — work log

_Appended 2026-09-30. Commits `f01e2ab`, `b0f3509`, `354f1ef`, `7e8959d`, `a7f152b`, `158bb25`, `b20f545` (all pushed, deployed to https://ultron-ai-ten.vercel.app)._

## Deployed 2026-09-30 — `158bb25` + `b20f545`

Verified in production. **The Firestore quota reset**, so persistence is live again end-to-end: a chat turn wrote its session and both messages, and `GET /api/sessions` returns real rows (20, the new limit) instead of a 503.

- [x] **STT no longer duplicates every phrase ~4x.** Chrome re-fires `onresult` with a `resultIndex` that was already consumed, so the same final transcript was appended over and over. `use-live-session.ts` tracks `lastFinalIndexRef` / `heardFinalsRef` so each final index commits exactly once. *Still wants a browser check with a real mic.*
- [x] **STT accuracy.** Server ASR (`groq whisper-large-v3`) sends `temperature=0` plus a domain `ASR_PROMPT`. The native browser path is unchanged.
- [x] **Startup API calls cut.** The chat page no longer fetches `/api/voice/voices` (the picker moved to Settings). Session list comes from a 60s `sessionStorage` cache (`lib/client-cache.ts`) with a 5-minute quota backoff; list limit 50 → 20; `GET /api/sessions/[id]` takes a `limit` (default 100, max 200); new store-free, edge-cached `GET /api/providers`.
- [x] **Settings tab.** `app/settings/page.tsx` — Model / Voice / Behaviour. `lib/settings.ts` owns the persisted prefs via `useSettings()` on `useSyncExternalStore`; `useVoice` reads and writes the voice through it. All three toggles are wired: `speakReplies` gates the live speech queue, `confirmVoice` fills the composer instead of auto-sending, `bargeIn` reaches the interrupt path.
- [x] **Model switch component** (spec at the top of this file): `components/ui/ai-model-select.tsx`, driven by `getProviderCatalog()` — env-only, no database read. The chosen `provider`/`model` go out with the chat POST.
- [x] **Composer slimmed down.** `VoicePicker` moved to `components/ui/voice-picker.tsx`; `voices` / `voiceKey` / `onVoiceChange` are gone from `ai-prompt-box.tsx`, `composer.tsx` and `chat-window.tsx`.
- [x] **Tool calls show real elapsed time.** `ThinkingState` gained a `live` prop: the nodes are genuine trace events and must not be auto-advanced, but the turn is now clocked for real instead of spinning indefinitely. `message-bubble.tsx` passes `live={message.streaming}`.
- [x] **Fixed a real ordering bug** in `db/firestore-store.ts`: `listMessages` ordered `createdAt` ascending *then* applied `limit`, so the new `?limit` would have returned the **oldest** N and silently dropped the current conversation. It now reads desc and reverses, keeping the ascending contract. Verified — `?limit=1` returns the final assistant message.
- [x] **React Compiler lint satisfied.** Caches are seeded in lazy `useState` initializers and state is derived (`isOpen = open && !disabled`, `working = live || (autoPlay && isWorking)`) instead of being synced in effects.
- [x] `tsc --noEmit`, `eslint`, and `next build` clean; probe session deleted after verification.

## Deployed 2026-09-30 — `aded3a0`, `6fe6c89`

- [x] **Collapsed the voice listbox** (`components/ui/voice-picker.tsx`): `max-h-72` → `max-h-56`, single-line compact rows, matches the trigger width, thin styled scrollbar so a clipped list reads as scrollable rather than truncated. Also stopped the arrow-key cursor going `NaN` when the voice list is still empty.
- [x] **Rewrote the persona** (`ai/agent.ts` `buildSystemPrompt`). The old prompt was a list of adjectives ("witty, precise, JARVIS-style"); the new one is concrete and testable: at most one light touch of humour and never at the user's expense, no filler agreement, steady when the user is stressed, correct-and-move-on when wrong, answer-first with no restating the question.
- [x] **Voice mode is a real signal now.** The old prompt said *"when the user is in a voice/live conversation, keep answers short"* — but nothing ever told the model it was in a voice conversation, so the rule could never fire and TTS read `**bold**`, `12%` and raw URLs aloud. `chat-window` now flags dictated turns (`voice: true`), the route forwards it, and the agent swaps in voice rules: one to three sentences, no markdown, numbers and URLs written for the ear ("twelve percent", "example dot com"). Verified in production — the same question returns spoken prose in voice mode and bold markdown in text mode.
- [x] **Removed the client-controlled `system` field** on `POST /api/chat`. It replaced the entire system prompt, so any caller could POST their own prompt and keep tool access. No client sent it.

## Recommended: Gemini-live-style interaction, keeping our own STT/TTS (2026-09-30)

**Reported problem:** in live mode the microphone keeps listening after the reply has landed, and speech does not start until the whole message has arrived.

**Rejected alternative:** handing TTS to the Gemini Live API. It would fix this, but it changes the stack (and costs a native-audio model whose tool use is weaker). We want the *interaction pattern* — instant speech, reliable interruption — not Gemini's audio. Keep Groq STT and Edge TTS; rebuild the loop around streaming.

This is the half-cascade pattern implemented by hand: the LLM streams text, we speak each sentence the moment it is complete, and playback of sentence N overlaps generation of sentence N+1.

### Root causes

1. **Dead air before speech.** `liveOnTurn` awaits `submit()` to completion, and only then calls `speakReply(reply)`, which sends the *entire* answer as a single `/api/voice/tts` request. So the wait is generation time **plus** synthesis time, with nothing audible in between. The speech queue (`pendingRef`/`pump`) already serialises playback correctly — nothing ever *feeds* it incrementally.
2. **The mic is left open on purpose.** `use-live-session.ts:443` keeps recognition running through `thinking`/`speaking` so barge-in can work, and `startRecognition` never calls `getUserMedia`, so **no `echoCancellation` is ever active on Chrome** — the mic genuinely hears Ultron talking.
3. **Barge-in therefore guesses.** It requires ≥2 transcribed words, ignores the first 700 ms, and fuzzy-matches the echo. It is reacting to *words*, which arrive far too late to feel responsive, instead of to the user *starting to speak*.

### Key finding that makes this cheap

**The VAD never runs on Chrome.** `analyserRef` / `speechActiveRef` / `lastSpeechAtRef` are set up in `startFallback()` only, and `start()` calls `startFallback()` *only* when `getNativeRecognition()` is missing. Chrome has `SpeechRecognition`, so the analyser is never created and there is no energy signal at all. The detection machinery already exists — it is just never started on the browser we actually use.

### Plan

1. **Always open an AEC mic, for detection only.** On `start()`, get a `getUserMedia` stream with `echoCancellation`/`noiseSuppression`/`autoGainControl` and run the existing RMS analyser, *in addition to* `SpeechRecognition`. The analyser is used for barge-in onset; `SpeechRecognition` still does the transcription. One flag decides which path owns the recorder.
2. **Barge in on speech onset, not on words.** While `speaking`, the rising edge of the RMS signal is the cut-in trigger — roughly 120 ms of latency instead of waiting for a sentence. Keep a short (~250 ms) guard for the first syllable leaking through the speaker, and drop the ≥2-word and `looksLikeEcho` heuristics entirely.
3. **Speak sentences as they stream.** Give `submit()` an `onDelta` callback. Live mode feeds it into a splitter that holds back the incomplete trailing fragment and emits each finished sentence to `enqueueSpeech`. The first sentence is synthesised while the rest of the answer is still being generated.
4. **Fix the status machine.** Flip to `speaking` when the first sentence is *enqueued* (not after `done`), and only return to `listening` once the queue has actually drained — that is the "listening continues" symptom.
5. **Cache TTS audio.** The route sends `Cache-Control: no-store`, so identical text is re-synthesised on every repeat (reconnects, retries, "say that again"). A small in-memory LRU on the server removes both the pause and the cost. Worth doing because per-sentence requests multiply Edge calls.
6. **Barge-in must be immediate.** On cut-in: abort the in-flight chat stream, stop audio, clear the pending queue *and* abort any in-flight TTS fetch, then dispatch the new command as soon as its transcript lands. Dropping queued audio but not in-flight fetches is why the old path sometimes "cancelled the wrong turn".

### Tasks

- [ ] Always-on AEC detection stream + VAD, independent of which STT path is active
- [ ] Rewrite `handleBargeIn` to trigger on VAD onset; delete the ≥2-word, 700 ms and `looksLikeEcho` heuristics
- [ ] Add `onDelta` to `submit()`; add a sentence splitter that holds the trailing fragment
- [ ] Enqueue sentences as they stream; drop the whole-reply `speakReply` path for live turns
- [ ] Status: `speaking` from first enqueue, `listening` only when the queue drains
- [ ] `AbortController` on the TTS fetch so barge-in kills in-flight synthesis
- [ ] Server-side LRU cache for `/api/voice/tts` (keyed on text + voice)
- [ ] Keep the existing HTTP pipeline as the fallback path

### Notes on this route

- Still one TTS round trip per sentence, so the first-sentence latency is now *generation* of sentence 1, not the whole answer. Per-sentence prosody and pause control become feasible too, since each request is small.
- `buildSystemPrompt({ voice: true })` already constrains replies to 1–3 plain sentences, which is what keeps the sentence count (and therefore the number of TTS calls) low.
- If the per-sentence round trips still feel slow, the next lever is a streaming TTS API, not more prompt tuning.

## TTS engine decision — Cartesia Sonic 3.5 (2026-09-30)

**Decision:** replace `msedge-tts` with **Cartesia Sonic 3.5**, and let delivery **vary with the mood** of the answer. Keep Edge TTS as the fallback until this is verified good.

**Why (benchmarks, July–Aug 2026):**

| Engine | Time to first audio | Blind-listener score | Free tier | Notes |
|---|---|---|---|---|
| **Cartesia Sonic 3.5** | **188 ms P50 / 351 ms P90** | 1218 Elo (#1) | 20k credits/mo | WebSocket streaming, SSML controls |
| Deepgram Flux | — | 73.4% win rate (#1) | $200 one-time | Best quality, but no SSML/prompting at all |
| ElevenLabs v3 | 288 ms (Flash) | 1179 Elo | 10k chars/mo | Only true prompt-style control (audio tags) |
| Kokoro-82M (local) | Real-time on CPU | 1060 Elo | Free forever | No cloning, no emotion control, needs a host |
| Edge TTS (current) | Slow, fully buffered | — | Free | Rejects `mstts:express-as` and `<break>` |

Latency is the deciding factor, not quality — Sonic 3.5 has both. Deepgram scored higher on blind preference but deliberately infers delivery with *no* control surface, which conflicts with the mood decision below.

### Control options (this is the "prompt" surface)

Cartesia uses SSML, not natural-language prompts. Supported: `speed`, `volume`, `emotion`, `break`, `spell`.

```xml
<speed ratio="1.1"/>            <!-- 0.6–1.5 -->
<volume ratio="0.8"/>           <!-- 0.5–2.0 -->
<emotion value="amused"/>       <!-- beta -->
<break time="400ms"/>
<spell>...</spell>              <!-- strict character-by-character -->
[laughs]                        <!-- laughter -->
```

### Gotchas found in the docs — read before implementing

- **Speed and volume are temporarily disabled on `sonic-3-latest`.** Sonic 3.5 explicitly has more natural pacing, but if we rely on `<speed>`/`<volume>` we must pin **`sonic-3`** until that is restored.
- **Streaming tag-by-tag reads the tag aloud.** When streaming input, the *whole* value of a `<speed>`/`<volume>` tag must be buffered before sending, or it will be spoken as content ("passing in `1`, `.`, `0` as separate inputs will result in reading out the tags").
- **`<emotion>` is beta and mid-generation shifts are unreliable.** Cartesia's own guidance: use **separate generation contexts per emotion** rather than changing emotion inside one transcript, and use voices tagged "Emotive" — it may not work with other voices.
- **Punctuation is the primary pause tool.** A comma or full stop already gives a natural pause; reserve `<break>` for a specific, deliberate silence. Over-using `<break>` is likely a cause of the "too choppy" complaint, not a cure for it.
- **Do not chain `<spell>` and `<break>`.** Let text normalisation handle phone numbers and similar sequences; reach for `<spell>` only for strict character reads.

### Design consequence: mood must be decided per sentence

The mood-varying requirement collides with the sentence-streaming plan in a way that actually simplifies both. Because emotion cannot shift reliably mid-transcript, the mood has to be **chosen before synthesis starts** — and synthesis now happens per sentence. So:

- The LLM emits a lightweight mood tag per sentence alongside the text (a short `mood` field, not free-form prose).
- Each sentence is synthesised in its own request, prefixed with exactly one `<emotion value="..."/>`.
- This fits the existing half-cascade plan exactly: one small request per sentence, each independently controllable and independently cacheable.

Mood vocabulary should be small and fixed — e.g. `neutral`, `amused`, `warm`, `sincere`, `calm` — mapped to Cartesia's supported values, defaulting to `neutral` when absent or unrecognised. Ultron's persona already has a stated humour budget, so `amused` should be the exception, not the default.

### Open question — deliberately undecided

**Where does the TTS run?** Left open on purpose. Cloud Cartesia needs nothing but an API key and works on Vercel today. If a small always-on host is ever acceptable, local Kokoro becomes viable later at zero cost (Apache 2.0, CPU-real-time) — but it has no emotion control, so it would be a downgrade for the mood goal. Decision deferred.

### Tasks

- [ ] Add `CARTESIA_API_KEY` handling and a provider abstraction behind `POST /api/voice/tts` (engine chosen by env, client untouched)
- [ ] Sonic 3.5 via `sonic-3` pin if `<speed>`/`<volume>` are used; else `sonic-3-latest`
- [ ] Add the `mood` field to the streamed reply and define the fixed vocabulary + default
- [ ] Emit one `<emotion>` per sentence request; never mid-transcript
- [ ] Buffer `<speed>`/`<volume>` values whole when streaming, per the docs
- [ ] Pick "Emotive"-tagged voices only
- [ ] Move to Cartesia's WebSocket speak endpoint once sentences are already per-sentence
- [ ] Keep Edge TTS as fallback; verify by ear before removing

## Pending

- [ ] **Superseded by the Gemini Live plan above** — voice latency ("speak as fast as the message arrives"), the listening-continues bug, barge-in tuning, and reply text/audio streaming are all consequences of the buffered STT+TTS pipeline. Fixing them individually means tuning a design we intend to replace. Keep as fallback-only work.
- [ ] Browser-audition voice quality, the Settings tab, slash menu, barge-in, and push-to-talk
- [ ] Wrap the remaining store-backed routes (`/api/system`, …) with `storeErrorResponse()` — they still return a bare 500 when the store is quota-blocked. (`/api/providers` is exempt: it reads nothing from the store.)
- [x] Fix the API-call overload that burned the quota: the sidebar polled `GET /api/sessions` every 4s and every call ran one `count()` aggregation per session (N+1). Removed the interval and dropped the per-session counts.

## Deferred (not done now — on purpose)

- [ ] ~~Wrap the remaining store-backed routes (`/api/system`, …) with `storeErrorResponse()` — they still return a bare 500 when the store is quota-blocked.~~ — see Pending. (`/api/providers` is exempt: it reads nothing from the store.)
- [x] ~~`/api/chat` fails hard when the store is down~~ — fixed in `a7f152b`; every store touch is behind `tryStore()` and chat streams regardless.
- [x] ~~After the Firestore quota resets, re-verify `/api/memory`, `/api/sessions` and chat persistence end-to-end~~ — **done 2026-09-30.** The quota reset, `/api/memory` and `/api/sessions` return 200, and a probe chat turn persisted its session and both messages (then deleted).
- [ ] `messageCount` is now hard-coded to `0` in the Firestore session list (nothing in the UI read it). If a count badge is ever wanted, denormalize a counter onto the session doc instead of aggregating per row
- [ ] Firestore free-tier quota: upgrade the project to Blaze (or add a budget alert) to remove the daily read cap — the app will hit this again with normal use
- [ ] Optional resilience: fall back to libSQL/Turso storage when Firestore is quota-blocked, rather than failing the request

## Notes

- Free Edge TTS rejects `mstts:express-as` and `<break>`; expressive delivery is unavailable for free.
- ElevenLabs (10k chars/mo free) is the only zero-cost step up and activates automatically once `ELEVENLABS_API_KEY` is set.
- `lib/settings.ts` is the single owner of the voice key, so the Settings tab and the running voice session can't drift. It deliberately has no server side: preferences are per-browser and cost no Firestore reads.
- `getProviderCatalog()` is env-only on purpose. If the provider table ever needs to be edited at runtime, that's a separate store-backed feature — don't quietly re-add a DB read to this one, or opening Settings starts costing quota again.
- `tailwind-merge` was added as a dependency for the model selector.

