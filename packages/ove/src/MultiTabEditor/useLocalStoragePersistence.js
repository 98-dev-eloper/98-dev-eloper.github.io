import { useEffect, useRef, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { debounce } from "lodash-es";
import {
  restoreMultiTabState,
  getEditorNameForTab
} from "../redux/fileTabs";
import updateEditor from "../updateEditor";

const STORAGE_KEY_PREFIX = "ove_multiTab_";
const DEBOUNCE_MS = 1000;

/**
 * Hook for persisting multi-tab editor state to localStorage
 *
 * @param {string} baseEditorName - Base name of the multi-tab editor
 * @param {boolean} enabled - Whether persistence is enabled
 * @param {Object} store - Redux store reference
 */
export function useLocalStoragePersistence(baseEditorName, enabled, store) {
  const dispatch = useDispatch();
  const initialLoadDone = useRef(false);
  const storageKey = STORAGE_KEY_PREFIX + baseEditorName;

  // Get current multi-tab state
  const multiTabState = useSelector(
    state => state.VectorEditor?.__multiTabEditors?.[baseEditorName]
  );

  const { tabs = [], activeTabId, tabOrder = [] } = multiTabState || {};

  // Restore from localStorage on mount
  useEffect(() => {
    if (!enabled || initialLoadDone.current) return;
    initialLoadDone.current = true;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      const { tabs: storedTabs, activeTabId: storedActiveId, tabOrder: storedOrder, editorStates } = data;

      if (!storedTabs || storedTabs.length === 0) return;

      // Restore multi-tab state
      dispatch(
        restoreMultiTabState(
          {
            tabs: storedTabs,
            activeTabId: storedActiveId,
            tabOrder: storedOrder
          },
          { editorName: baseEditorName }
        )
      );

      // Restore each editor's state
      if (editorStates) {
        Object.entries(editorStates).forEach(([tabId, editorState]) => {
          const editorName = getEditorNameForTab(baseEditorName, tabId);
          updateEditor(store, editorName, editorState);
        });
      }
    } catch (e) {
      console.warn("Failed to restore multi-tab state:", e);
    }
  }, [enabled, dispatch, baseEditorName, storageKey, store]);

  // Save to localStorage function
  const saveToLocalStorage = useCallback(() => {
    if (!enabled) return;

    try {
      const state = store.getState();
      const currentMultiTabState = state.VectorEditor?.__multiTabEditors?.[baseEditorName];

      if (!currentMultiTabState) return;

      const { tabs: currentTabs, activeTabId: currentActiveId, tabOrder: currentOrder } = currentMultiTabState;

      if (!currentTabs || currentTabs.length === 0) {
        localStorage.removeItem(storageKey);
        return;
      }

      // Collect editor states for all tabs (only essential data)
      const editorStates = {};
      currentTabs.forEach(tab => {
        const editorName = getEditorNameForTab(baseEditorName, tab.id);
        const editorState = state.VectorEditor?.[editorName];

        if (editorState?.sequenceData) {
          editorStates[tab.id] = {
            sequenceData: editorState.sequenceData,
            lastSavedId: editorState.lastSavedId
          };
        }
      });

      const dataToSave = {
        tabs: currentTabs,
        activeTabId: currentActiveId,
        tabOrder: currentOrder,
        editorStates,
        savedAt: Date.now()
      };

      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    } catch (e) {
      console.warn("Failed to save multi-tab state:", e);
    }
  }, [enabled, store, baseEditorName, storageKey]);

  // Debounced save function
  const debouncedSave = useRef(
    debounce(() => {
      saveToLocalStorage();
    }, DEBOUNCE_MS)
  ).current;

  // Save on state changes
  useEffect(() => {
    if (!enabled || !initialLoadDone.current) return;

    debouncedSave();

    return () => {
      debouncedSave.cancel();
    };
  }, [tabs, activeTabId, tabOrder, enabled, debouncedSave]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (enabled) {
        debouncedSave.cancel();
        saveToLocalStorage();
      }
    };
  }, [enabled, debouncedSave, saveToLocalStorage]);

  return {
    saveNow: saveToLocalStorage,
    clearStorage: useCallback(() => {
      localStorage.removeItem(storageKey);
    }, [storageKey])
  };
}

export default useLocalStoragePersistence;
