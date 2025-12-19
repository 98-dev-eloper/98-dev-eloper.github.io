import React, { useCallback } from "react";
import { useDispatch, useStore } from "react-redux";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import { Button } from "@blueprintjs/core";
import { showContextMenu } from "@teselagen/ui";
import {
  closeFileTab,
  setActiveFileTab,
  updateFileTabOrder,
  getEditorNameForTab
} from "../redux/fileTabs";
import { actions } from "../redux";
import FileTab from "./FileTab";

/**
 * Chrome-style file tab bar component
 * Supports drag-and-drop reordering, context menu, and add tab button
 */
function FileTabBar({
  tabs,
  tabOrder,
  activeTabId,
  baseEditorName,
  onAddTab,
  onTabClose
}) {
  const dispatch = useDispatch();
  const store = useStore();

  // Get ordered tabs
  const orderedTabs = tabOrder
    .map(id => tabs.find(t => t.id === id))
    .filter(Boolean);

  const handleTabClick = useCallback(
    tabId => {
      dispatch(setActiveFileTab(tabId, { editorName: baseEditorName }));
    },
    [dispatch, baseEditorName]
  );

  const handleTabClose = useCallback(
    (tabId, e) => {
      if (e) e.stopPropagation();

      // Check if the tab has unsaved changes
      const editorName = getEditorNameForTab(baseEditorName, tabId);
      const state = store.getState();
      const editor = state.VectorEditor?.[editorName];

      if (editor) {
        const { sequenceData, lastSavedId } = editor;
        const isModified =
          sequenceData?.stateTrackingId !== lastSavedId &&
          sequenceData?.stateTrackingId !== "initialLoadId";

        if (isModified) {
          // Confirm before closing unsaved tab
          const confirmed = window.confirm(
            `"${tabs.find(t => t.id === tabId)?.fileName || "Untitled"}" has unsaved changes. Close anyway?`
          );
          if (!confirmed) return;
        }
      }

      // Call custom onTabClose handler if provided
      if (onTabClose) {
        onTabClose(tabId);
      }

      // Close the tab
      dispatch(closeFileTab(tabId, { editorName: baseEditorName }));

      // Clear the editor state for this tab
      dispatch(
        actions.vectorEditorClear(undefined, {
          editorName: getEditorNameForTab(baseEditorName, tabId)
        })
      );
    },
    [dispatch, baseEditorName, store, tabs, onTabClose]
  );

  const handleCloseOthers = useCallback(
    keepTabId => {
      tabs.forEach(tab => {
        if (tab.id !== keepTabId) {
          handleTabClose(tab.id);
        }
      });
    },
    [tabs, handleTabClose]
  );

  const handleCloseAll = useCallback(() => {
    tabs.forEach(tab => {
      handleTabClose(tab.id);
    });
  }, [tabs, handleTabClose]);

  const handleContextMenu = useCallback(
    (e, tab) => {
      e.preventDefault();

      const menuItems = [
        {
          text: "Close",
          icon: "small-cross",
          onClick: () => handleTabClose(tab.id)
        },
        {
          text: "Close Others",
          onClick: () => handleCloseOthers(tab.id),
          disabled: tabs.length <= 1
        },
        {
          text: "Close All",
          onClick: handleCloseAll,
          disabled: tabs.length === 0
        }
      ];

      showContextMenu(menuItems, undefined, e);
    },
    [tabs, handleTabClose, handleCloseOthers, handleCloseAll]
  );

  const handleDragEnd = useCallback(
    result => {
      if (!result.destination) return;
      if (result.source.index === result.destination.index) return;

      const newOrder = Array.from(tabOrder);
      const [removed] = newOrder.splice(result.source.index, 1);
      newOrder.splice(result.destination.index, 0, removed);

      dispatch(updateFileTabOrder(newOrder, { editorName: baseEditorName }));
    },
    [tabOrder, dispatch, baseEditorName]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="ve-file-tab-bar-container">
        <Droppable droppableId="file-tabs" direction="horizontal">
          {(provided, snapshot) => (
            <div
              className={`ve-file-tab-bar ${snapshot.isDraggingOver ? "ve-file-tab-bar-dragging-over" : ""}`}
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {orderedTabs.map((tab, index) => (
                <FileTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={tab.id === activeTabId}
                  baseEditorName={baseEditorName}
                  onClick={() => handleTabClick(tab.id)}
                  onClose={handleTabClose}
                  onContextMenu={handleContextMenu}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        <Button
          minimal
          small
          icon="plus"
          className="ve-add-tab-button"
          onClick={onAddTab}
          title="New Tab"
        />
      </div>
    </DragDropContext>
  );
}

export default FileTabBar;
