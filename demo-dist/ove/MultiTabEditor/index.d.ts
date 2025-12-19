export default MultiTabEditor;
/**
 * MultiTabEditor - Chrome-style multi-file tab editor
 *
 * A wrapper around the OVE Editor that allows multiple sequence files
 * to be opened and managed in separate tabs.
 *
 * @param {Object} props
 * @param {string} props.baseEditorName - Base name for this multi-tab editor instance
 * @param {Function} props.onImport - Custom import handler (receives sequenceData, file, props)
 * @param {Function} props.onSave - Custom save handler per tab
 * @param {Function} props.onTabChange - Callback when active tab changes
 * @param {Function} props.onTabClose - Callback when a tab is closed
 * @param {boolean} props.persistToLocalStorage - Whether to persist tabs to localStorage (default: true)
 * @param {Object} props.initialSequenceData - Initial sequence data for first tab
 * @param {Object} props...editorProps - All other props passed to Editor component
 */
declare function MultiTabEditor({ baseEditorName, onImport, onSave, onTabChange, onTabClose, persistToLocalStorage, initialSequenceData, ...editorProps }: {
    baseEditorName: string;
    onImport: Function;
    onSave: Function;
    onTabChange: Function;
    onTabClose: Function;
    persistToLocalStorage: boolean;
    initialSequenceData: Object;
}): import("react/jsx-runtime").JSX.Element;
