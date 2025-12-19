import { createReducer } from "redux-act";
import createAction from "./utils/createMetaAction";
import shortid from "shortid";

// ------------------------------------
// Helper Functions
// ------------------------------------

/**
 * Generate unique editor name for a tab
 * @param {string} baseEditorName - Base name of the multi-tab editor
 * @param {string} tabId - Unique tab ID
 * @returns {string} Unique editor name
 */
export const getEditorNameForTab = (baseEditorName, tabId) =>
  `${baseEditorName}__${tabId}`;

/**
 * Generate a new unique tab ID
 * @returns {string} Unique tab ID
 */
export const generateTabId = () => shortid.generate();

// ------------------------------------
// Actions
// ------------------------------------

// Action to add a new file tab
export const addFileTab = createAction("FILE_TABS_ADD_TAB");

// Action to close a file tab
export const closeFileTab = createAction("FILE_TABS_CLOSE_TAB");

// Action to set active tab
export const setActiveFileTab = createAction("FILE_TABS_SET_ACTIVE");

// Action to update tab order (for drag-drop reordering)
export const updateFileTabOrder = createAction("FILE_TABS_UPDATE_ORDER");

// Action to rename a file tab
export const renameFileTab = createAction("FILE_TABS_RENAME");

// Action to mark tab as modified or saved
export const setFileTabModified = createAction("FILE_TABS_SET_MODIFIED");

// Action to initialize multi-tab state
export const initializeMultiTabEditor = createAction("FILE_TABS_INITIALIZE");

// Action to restore state from localStorage
export const restoreMultiTabState = createAction("FILE_TABS_RESTORE_STATE");

// ------------------------------------
// Initial State
// ------------------------------------

const initialState = {
  tabs: [],
  activeTabId: null,
  tabOrder: []
};

// ------------------------------------
// Reducer
// ------------------------------------

const fileTabsReducer = createReducer(
  {
    [addFileTab]: (state, payload) => {
      const tabId = payload.id || generateTabId();
      const newTab = {
        id: tabId,
        fileName: payload.fileName || "Untitled",
        filePath: payload.filePath || null,
        isModified: false,
        lastActiveTimestamp: Date.now(),
        createdAt: Date.now()
      };

      return {
        ...state,
        tabs: [...state.tabs, newTab],
        tabOrder: [...state.tabOrder, tabId],
        activeTabId: tabId
      };
    },

    [closeFileTab]: (state, tabId) => {
      const newTabs = state.tabs.filter(t => t.id !== tabId);
      const newOrder = state.tabOrder.filter(id => id !== tabId);

      let newActiveId = state.activeTabId;

      if (state.activeTabId === tabId && newTabs.length > 0) {
        // Find the tab to activate after closing
        const closedIndex = state.tabOrder.indexOf(tabId);
        if (closedIndex > 0) {
          // Activate the tab before the closed one
          newActiveId = state.tabOrder[closedIndex - 1];
        } else if (newOrder.length > 0) {
          // Activate the first tab
          newActiveId = newOrder[0];
        }
      } else if (newTabs.length === 0) {
        newActiveId = null;
      }

      return {
        ...state,
        tabs: newTabs,
        tabOrder: newOrder,
        activeTabId: newActiveId
      };
    },

    [setActiveFileTab]: (state, tabId) => {
      if (!state.tabs.find(t => t.id === tabId)) {
        return state;
      }

      return {
        ...state,
        activeTabId: tabId,
        tabs: state.tabs.map(tab =>
          tab.id === tabId
            ? { ...tab, lastActiveTimestamp: Date.now() }
            : tab
        )
      };
    },

    [updateFileTabOrder]: (state, newOrder) => ({
      ...state,
      tabOrder: newOrder
    }),

    [renameFileTab]: (state, { tabId, fileName }) => ({
      ...state,
      tabs: state.tabs.map(tab =>
        tab.id === tabId ? { ...tab, fileName } : tab
      )
    }),

    [setFileTabModified]: (state, { tabId, isModified }) => ({
      ...state,
      tabs: state.tabs.map(tab =>
        tab.id === tabId ? { ...tab, isModified } : tab
      )
    }),

    [initializeMultiTabEditor]: (state, payload) => {
      if (state.tabs.length > 0) {
        // Already initialized
        return state;
      }

      const initialTabs = payload.tabs || [];
      if (initialTabs.length === 0) {
        return state;
      }

      return {
        ...state,
        tabs: initialTabs.map(tab => ({
          id: tab.id || generateTabId(),
          fileName: tab.fileName || "Untitled",
          filePath: tab.filePath || null,
          isModified: false,
          lastActiveTimestamp: Date.now(),
          createdAt: Date.now()
        })),
        tabOrder: initialTabs.map(tab => tab.id || generateTabId()),
        activeTabId: payload.activeTabId || initialTabs[0]?.id
      };
    },

    [restoreMultiTabState]: (state, payload) => ({
      ...state,
      tabs: payload.tabs || [],
      tabOrder: payload.tabOrder || [],
      activeTabId: payload.activeTabId || null
    })
  },
  initialState
);

export default fileTabsReducer;

// ------------------------------------
// Selectors
// ------------------------------------

/**
 * Get multi-tab editor state by base editor name
 */
export const getMultiTabEditorState = (state, baseEditorName) =>
  state.VectorEditor?.__multiTabEditors?.[baseEditorName] || initialState;

/**
 * Get all tabs for a multi-tab editor
 */
export const getFileTabs = (state, baseEditorName) =>
  getMultiTabEditorState(state, baseEditorName).tabs;

/**
 * Get ordered tabs for a multi-tab editor
 */
export const getOrderedFileTabs = (state, baseEditorName) => {
  const { tabs, tabOrder } = getMultiTabEditorState(state, baseEditorName);
  return tabOrder
    .map(id => tabs.find(t => t.id === id))
    .filter(Boolean);
};

/**
 * Get active tab for a multi-tab editor
 */
export const getActiveFileTab = (state, baseEditorName) => {
  const { tabs, activeTabId } = getMultiTabEditorState(state, baseEditorName);
  return tabs.find(t => t.id === activeTabId) || null;
};

/**
 * Get active tab's editor name
 */
export const getActiveEditorName = (state, baseEditorName) => {
  const activeTab = getActiveFileTab(state, baseEditorName);
  return activeTab ? getEditorNameForTab(baseEditorName, activeTab.id) : null;
};
