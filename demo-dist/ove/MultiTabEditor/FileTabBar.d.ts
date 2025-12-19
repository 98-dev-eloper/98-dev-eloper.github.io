export default FileTabBar;
/**
 * Chrome-style file tab bar component
 * Supports drag-and-drop reordering, context menu, and add tab button
 */
declare function FileTabBar({ tabs, tabOrder, activeTabId, baseEditorName, onAddTab, onTabClose }: {
    tabs: any;
    tabOrder: any;
    activeTabId: any;
    baseEditorName: any;
    onAddTab: any;
    onTabClose: any;
}): import("react/jsx-runtime").JSX.Element;
