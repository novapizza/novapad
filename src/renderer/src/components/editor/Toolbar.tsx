import {
  FilePlus, FolderOpen, Save, SaveAll, FileX,
  Scissors, Copy, Clipboard,
  Undo2, Redo2,
  Search, Replace,
  ZoomIn, ZoomOut, RotateCcw,
  IndentIncrease, IndentDecrease, MessageSquare,
  ArrowUpDown, Eraser,
  Files, ListTree, Map as MapIcon, StickyNote, Sparkles,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { editorRegistry } from '../../utils/editorRegistry'
import { useUIStore } from '../../store/uiStore'
import { runCommand } from '../../commands/registry'
import { shortcutMod } from '../../utils/platform'

interface ToolbarProps {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAll: () => void
  onFind: () => void
  onReplace: () => void
  onClose: () => void
}

interface ToolbarItem {
  icon: React.ReactNode
  title: string
  action?: () => void
}

/** Open the sidebar to a specific panel, or close it if that panel is already showing. */
function toggleSidebarPanel(panel: 'files' | 'functions' | 'docmap') {
  const ui = useUIStore.getState()
  if (ui.showSidebar && ui.sidebarPanel === panel) {
    ui.setShowSidebar(false)
  } else {
    ui.setSidebarPanel(panel)
    ui.setShowSidebar(true)
  }
}

function editorCommand(command: string) {
  // Whole-window zoom is handled globally in App.tsx and must work even with no
  // active editor — route it through the shared editor:command event and bail
  // before the editor guard below.
  if (command === 'zoomIn' || command === 'zoomOut' || command === 'zoomReset') {
    window.dispatchEvent(new CustomEvent('editor:command', { detail: command }))
    return
  }
  const editor = editorRegistry.get()
  if (!editor) return
  switch (command) {
    case 'indentLines': editor.trigger('keyboard', 'editor.action.indentLines', {}); break
    case 'outdentLines': editor.trigger('keyboard', 'editor.action.outdentLines', {}); break
    case 'toggleComment': editor.getAction('editor.action.commentLine')?.run(); break
    case 'sortLinesAsc': editor.getAction('editor.action.sortLinesAscending')?.run(); break
    case 'trimTrailingWhitespace': editor.getAction('editor.action.trimTrailingWhitespace')?.run(); break
  }
}

export function Toolbar({ onNew, onOpen, onSave, onSaveAll, onFind, onReplace, onClose }: ToolbarProps) {
  const mod = shortcutMod()
  const sz = 18
  const groups: ToolbarItem[][] = [
    // File
    [
      { icon: <FilePlus size={sz} />, title: `New (${mod}+N)`, action: onNew },
      { icon: <FolderOpen size={sz} />, title: `Open (${mod}+O)`, action: onOpen },
      { icon: <Save size={sz} />, title: `Save (${mod}+S)`, action: onSave },
      { icon: <SaveAll size={sz} />, title: 'Save All', action: onSaveAll },
      { icon: <FileX size={sz} />, title: `Close (${mod}+W)`, action: onClose },
    ],
    // Edit
    [
      { icon: <Undo2 size={sz} />, title: `Undo (${mod}+Z)`, action: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: 'undo' })) },
      { icon: <Redo2 size={sz} />, title: `Redo (${mod}+Y)`, action: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: 'redo' })) },
    ],
    // Clipboard
    [
      { icon: <Scissors size={sz} />, title: `Cut (${mod}+X)`, action: () => document.execCommand('cut') },
      { icon: <Copy size={sz} />, title: `Copy (${mod}+C)`, action: () => document.execCommand('copy') },
      { icon: <Clipboard size={sz} />, title: `Paste (${mod}+V)`, action: () => document.execCommand('paste') },
    ],
    // Search
    [
      { icon: <Search size={sz} />, title: `Find (${mod}+F)`, action: onFind },
      { icon: <Replace size={sz} />, title: `Replace (${mod}+H)`, action: onReplace },
    ],
    // Zoom
    [
      { icon: <ZoomIn size={sz} />, title: 'Zoom In', action: () => editorCommand('zoomIn') },
      { icon: <ZoomOut size={sz} />, title: 'Zoom Out', action: () => editorCommand('zoomOut') },
      { icon: <RotateCcw size={sz} />, title: 'Reset Zoom', action: () => editorCommand('zoomReset') },
    ],
    // Formatting
    [
      { icon: <IndentIncrease size={sz} />, title: 'Indent', action: () => editorCommand('indentLines') },
      { icon: <IndentDecrease size={sz} />, title: 'Outdent', action: () => editorCommand('outdentLines') },
      { icon: <MessageSquare size={sz} />, title: 'Toggle Comment', action: () => editorCommand('toggleComment') },
    ],
    // Actions
    [
      { icon: <ArrowUpDown size={sz} />, title: 'Sort Lines', action: () => editorCommand('sortLinesAsc') },
      { icon: <Eraser size={sz} />, title: 'Trim Whitespace', action: () => editorCommand('trimTrailingWhitespace') },
    ],
    // Panels — open the sidebar to a specific view
    [
      { icon: <Files size={sz} />, title: `Explorer (${mod}+B)`, action: () => toggleSidebarPanel('files') },
      { icon: <ListTree size={sz} />, title: 'Function / Symbol List', action: () => toggleSidebarPanel('functions') },
      { icon: <MapIcon size={sz} />, title: 'Document Map', action: () => toggleSidebarPanel('docmap') },
      // Notes stacks below the active panel rather than replacing it, so it goes
      // through toggleNotesPanel instead of toggleSidebarPanel.
      { icon: <StickyNote size={sz} />, title: `Notes (${mod}+Shift+N)`, action: () => useUIStore.getState().toggleNotesPanel() },
    ],
  ]

  return (
    <div className="h-10 bg-toolbar border-b border-toolbar-border flex items-center px-2.5 gap-0.5 select-none shrink-0 overflow-x-auto" data-testid="toolbar">
      <TooltipProvider delayDuration={300}>
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-toolbar-border mx-1.5 shrink-0" />}
            {group.map((item, ii) => (
              <Tooltip key={ii}>
                <TooltipTrigger asChild>
                  <button
                    className="w-8 h-8 flex items-center justify-center text-toolbar-foreground hover:text-foreground hover:bg-secondary active:bg-muted rounded-lg transition-colors shrink-0"
                    onClick={item.action}
                    aria-label={item.title}
                  >
                    {item.icon}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-base">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
        <div className="flex-1 min-w-2" />
        {/* Always shown, even with AI off: the command sends the user to
            Settings ▸ AI Assistant until a key is set up, so this is how they find it. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="h-8 px-2.5 flex items-center gap-1.5 text-primary font-medium hover:bg-primary/10 rounded-lg transition-colors shrink-0"
              onClick={() => runCommand('view.aiAssistant')}
              data-testid="toolbar-ai"
            >
              <Sparkles size={16} />
              Ask AI
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-base">
            {`AI Assistant (${mod}+Shift+A)`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
