import React, { useCallback, useEffect, useMemo } from "react";
import { useSelector, useDispatch, useStore } from "react-redux";
import shortid from "shortid";
import Editor from "../Editor";
import FileTabBar from "./FileTabBar";
import {
  addFileTab,
  setActiveFileTab,
  getEditorNameForTab,
  generateTabId
} from "../redux/fileTabs";
import updateEditor from "../updateEditor";
import { useLocalStoragePersistence } from "./useLocalStoragePersistence";
import "./style.css";

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
function MultiTabEditor({
  baseEditorName = "MultiTabEditor",
  onImport,
  onSave,
  onTabChange,
  onTabClose,
  persistToLocalStorage = true,
  initialSequenceData,
  ...editorProps
}) {
  const dispatch = useDispatch();
  const store = useStore();

  // Get multi-tab state from Redux
  const multiTabState = useSelector(
    state => state.VectorEditor?.__multiTabEditors?.[baseEditorName]
  );

  const { tabs = [], activeTabId, tabOrder = [] } = multiTabState || {};

  // Get active tab
  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) || null,
    [tabs, activeTabId]
  );

  // Get active tab's editor name
  const activeEditorName = useMemo(
    () => (activeTab ? getEditorNameForTab(baseEditorName, activeTab.id) : null),
    [baseEditorName, activeTab]
  );

  // LocalStorage persistence
  useLocalStoragePersistence(baseEditorName, persistToLocalStorage, store);

  // Initialize with first tab if none exist
  useEffect(() => {
    if (tabs.length === 0) {
      const tabId = generateTabId();
      const editorName = getEditorNameForTab(baseEditorName, tabId);

      // Add initial tab
      dispatch(
        addFileTab(
          {
            id: tabId,
            fileName: initialSequenceData?.name || "Untitled"
          },
          { editorName: baseEditorName }
        )
      );

      // Initialize editor state for the tab
      if (initialSequenceData) {
        updateEditor(store, editorName, {
          sequenceData: initialSequenceData
        });
      }
    }
  }, [tabs.length, dispatch, baseEditorName, store, initialSequenceData]);

  // Notify on tab change
  useEffect(() => {
    if (onTabChange && activeTab) {
      onTabChange(activeTab, activeEditorName);
    }
  }, [activeTabId, activeTab, activeEditorName, onTabChange]);

  // Handle import - creates new tab
  const handleImport = useCallback(
    async (sequenceData, file, props) => {
      // Let user's onImport transform data if provided
      let finalSequenceData = sequenceData;
      if (onImport) {
        finalSequenceData = await onImport(sequenceData, file, props);
        if (!finalSequenceData) return null; // User cancelled or rejected
      }

      // Create new tab
      const tabId = generateTabId();
      const editorName = getEditorNameForTab(baseEditorName, tabId);

      dispatch(
        addFileTab(
          {
            id: tabId,
            fileName: finalSequenceData.name || file?.name || "Untitled"
          },
          { editorName: baseEditorName }
        )
      );

      // Initialize editor state for new tab
      updateEditor(store, editorName, {
        sequenceData: finalSequenceData
      });

      // Return null to prevent default import behavior in the current editor
      return null;
    },
    [baseEditorName, dispatch, onImport, store]
  );

  // Handle adding a new empty tab
  const handleAddTab = useCallback(() => {
    const tabId = generateTabId();
    const editorName = getEditorNameForTab(baseEditorName, tabId);

    dispatch(
      addFileTab(
        {
          id: tabId,
          fileName: "Untitled"
        },
        { editorName: baseEditorName }
      )
    );

    // Initialize with empty sequence
    updateEditor(store, editorName, {
      sequenceData: {
        sequence: "",
        name: "Untitled",
        circular: false
      }
    });
  }, [baseEditorName, dispatch, store]);

  // Handle save per tab
  const handleSave = useCallback(
    (opts, sequenceData, editorState, cb) => {
      if (onSave) {
        return onSave(opts, sequenceData, editorState, cb, activeTab);
      }
      // Default behavior - just call callback
      if (cb) cb();
    },
    [onSave, activeTab]
  );

  // Handle new file
  const handleNew = useCallback(() => {
    handleAddTab();
  }, [handleAddTab]);

  // Show placeholder if no tabs
  if (!activeEditorName || tabs.length === 0) {
    return (
      <div className="ve-multi-tab-editor">
        <FileTabBar
          tabs={tabs}
          tabOrder={tabOrder}
          activeTabId={activeTabId}
          baseEditorName={baseEditorName}
          onAddTab={handleAddTab}
          onTabClose={onTabClose}
        />
        <div className="ve-multi-tab-empty">
          <p>No files open</p>
          <button onClick={handleAddTab} className="ve-multi-tab-empty-button">
            Create New File
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ve-multi-tab-editor">
      <FileTabBar
        tabs={tabs}
        tabOrder={tabOrder}
        activeTabId={activeTabId}
        baseEditorName={baseEditorName}
        onAddTab={handleAddTab}
        onTabClose={onTabClose}
      />

      <div className="ve-multi-tab-editor-content">
        <Editor
          {...editorProps}
          editorName={activeEditorName}
          onImport={handleImport}
          onSave={handleSave}
          onNew={handleNew}
        />
      </div>
    </div>
  );
}

export default MultiTabEditor;
