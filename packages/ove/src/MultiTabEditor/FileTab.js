import React from "react";
import { useSelector } from "react-redux";
import { Draggable } from "@hello-pangea/dnd";
import { Icon } from "@blueprintjs/core";
import classNames from "classnames";
import { getEditorNameForTab } from "../redux/fileTabs";

/**
 * Individual file tab component
 * Displays file name, modified indicator, and close button
 */
function FileTab({
  tab,
  index,
  isActive,
  baseEditorName,
  onClick,
  onClose,
  onContextMenu
}) {
  const editorName = getEditorNameForTab(baseEditorName, tab.id);

  // Check if modified by comparing stateTrackingId with lastSavedId
  const isModified = useSelector(state => {
    const editor = state.VectorEditor?.[editorName];
    if (!editor) return false;
    const { sequenceData, lastSavedId } = editor;
    if (!sequenceData) return false;
    return (
      sequenceData.stateTrackingId !== lastSavedId &&
      sequenceData.stateTrackingId !== "initialLoadId"
    );
  });

  const handleCloseClick = e => {
    e.stopPropagation();
    onClose(tab.id, e);
  };

  return (
    <Draggable draggableId={tab.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={classNames("ve-file-tab", {
            "ve-file-tab-active": isActive,
            "ve-file-tab-dragging": snapshot.isDragging,
            "ve-file-tab-modified": isModified
          })}
          onClick={onClick}
          onContextMenu={e => onContextMenu(e, tab)}
          title={tab.fileName}
        >
          {isModified && <span className="ve-file-tab-dot" />}
          <span className="ve-file-tab-name">{tab.fileName}</span>
          <span
            className="ve-file-tab-close"
            onClick={handleCloseClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                handleCloseClick(e);
              }
            }}
          >
            <Icon icon="small-cross" size={12} />
          </span>
        </div>
      )}
    </Draggable>
  );
}

export default FileTab;
