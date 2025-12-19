export default FileTab;
/**
 * Individual file tab component
 * Displays file name, modified indicator, and close button
 */
declare function FileTab({ tab, index, isActive, baseEditorName, onClick, onClose, onContextMenu }: {
    tab: any;
    index: any;
    isActive: any;
    baseEditorName: any;
    onClick: any;
    onClose: any;
    onContextMenu: any;
}): import("react/jsx-runtime").JSX.Element;
