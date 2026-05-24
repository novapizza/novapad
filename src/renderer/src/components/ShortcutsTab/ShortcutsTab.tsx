import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useEditorStore } from '../../store/editorStore'

/**
 * Legacy placeholder. The shortcuts editor now lives inside the Settings tab
 * (Settings > Keyboard Shortcuts). If a buffer of kind 'shortcuts' is opened
 * — typically from a pre-merge session.json — redirect into Settings and
 * close this tab so the user lands on the new home.
 */
export function ShortcutsTab() {
  useEffect(() => {
    const store = useEditorStore.getState()
    const buf = store.findVirtualBuffer('shortcuts')
    useUIStore.getState().setPendingSettingsCategory('shortcuts')
    store.openVirtualTab('settings')
    if (buf) store.removeBuffer(buf.id)
  }, [])
  return null
}
