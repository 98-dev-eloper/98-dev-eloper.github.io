import React, { useState } from "react";
import { Callout } from "@blueprintjs/core";
import immer from "immer";
import biomsa from "biomsa";

import store from "./../store";
import { updateEditor, addAlignment } from "../../../src/";
import Editor from "../../../src/Editor";
import { setupOptions, setParamsIfNecessary } from "./../utils/setupOptions";
import exampleSequenceData from "./../exampleData/exampleSequenceData";
import { DialogFooter } from "@teselagen/ui";
import {
  autoAnnotateFeatures,
  autoAnnotateParts,
  autoAnnotatePrimers
} from "../../../src/AutoAnnotate";
import { defaultToolList } from "../../../src/ToolBar";

const defaultState = {
  showDemoOptions: false,
  readOnly: false,
  showMenuBar: true,
  displayMenuBarAboveTools: true,
  showReadOnly: true,
  showCircularity: false,
  showMoleculeType: true,
  showGCContentByDefault: true,
  GCDecimalDigits: 1,
  showAvailability: false,
  showCicularViewInternalLabels: true,
  shouldAutosave: true,
  allowPanelTabDraggable: true,
  isFullscreen: false,
  showAminoAcidUnitAsCodon: true,
  adjustCircularLabelSpacing: true,
  nameFontSizeCircularView: true,
  withRotateCircularView: true,
  withZoomCircularView: true,
  truncateLabelsThatDoNotFit: true,
  smartCircViewLabelRender: true,
  onlyShowLabelsThatDoNotFit: false,
  allowMultipleFeatureDirections: true,
  allowPrimerBasesToBeEdited: true,
  onNew: true,
  onImport: true,
  onSave: true,
  onSaveAs: true,
  onRename: true,
  onDuplicate: true,
  onDelete: true,
  onCopy: true,
  onPaste: true,
  onCreateNewFromSubsequence: true,
  alwaysAllowSave: true,
  withVersionHistory: true
};

export default class EditorDemo extends React.Component {
  constructor(props) {
    super(props);
    setupOptions({ that: this, defaultState, props });
    window.ove_updateEditor = vals => {
      updateEditor(store, "DemoEditor", vals);
    };
    window.ove_getEditorState = () => {
      return store.getState().VectorEditor["DemoEditor"];
    };
    updateEditor(store, "DemoEditor", {
      readOnly: false,
      sequenceData: exampleSequenceData,
      annotationVisibility: {
        chromatogram: true
      }
    });
  }

  componentDidUpdate() {
    setParamsIfNecessary({ that: this, defaultState });
  }

  changeFullscreenMode = e =>
    this.setState({
      isFullscreen: e.target.checked
    });

  render() {
    const {
      adjustCircularLabelSpacing,
      shouldAutosave,
      isFullscreen
    } = this.state;

    return (
      <React.Fragment>
        <div
          className={"EditorDemo"}
          style={{
            display: "flex",
            position: "relative",
            flexGrow: "1",
            minHeight: 0,
            height: "100%",
            width: "100%"
          }}
        >
          <Editor
            ToolBarProps={{
              toolList: defaultToolList.map(t => {
                if (t !== "alignmentTool") return t;
                return {
                  name: "alignmentTool",
                  Dropdown: SimpleAlignDropdown
                };
              })
            }}
            {...this.state}
            {...(this.state.readOnly && { readOnly: true })}
            {...(!this.state.truncateLabelsThatDoNotFit && {
              truncateLabelsThatDoNotFit: false
            })}
            editorName="DemoEditor"
            showMenuBar={this.state.showMenuBar}
            displayMenuBarAboveTools={this.state.displayMenuBarAboveTools}
            allowPrimerBasesToBeEdited={this.state.allowPrimerBasesToBeEdited}
            allowPanelTabDraggable={this.state.allowPanelTabDraggable}
            {...(this.state.onNew && {
              onNew: () => window.toastr.success("onNew callback triggered")
            })}
            {...(this.state.onImport && {
              onImport: sequence => {
                window.toastr.success(
                  `onImport callback triggered for sequence: ${sequence.name}`
                );
                return sequence;
              }
            })}
            {...(this.state.allowMultipleFeatureDirections && {
              allowMultipleFeatureDirections: true
            })}
            {...(this.state.onSave && {
              onSave: function (
                opts,
                sequenceDataToSave,
                editorState,
                onSuccessCallback
              ) {
                console.info("opts:", opts);
                console.info("sequenceData:", sequenceDataToSave);
                console.info("editorState:", editorState);
                window.toastr.success("onSave callback triggered");
                onSuccessCallback();
              }
            })}
            {...(this.state.onSaveAs && {
              onSaveAs: function (
                opts,
                sequenceDataToSave,
                editorState,
                onSuccessCallback
              ) {
                window.toastr.success("onSaveAs callback triggered");
                console.info("opts:", opts);
                console.info("sequenceData:", sequenceDataToSave);
                console.info("editorState:", editorState);
                onSuccessCallback();
              }
            })}
            {...(this.state.alwaysAllowSave && {
              alwaysAllowSave: true
            })}
            {...(this.state.onRename && {
              onRename: newName =>
                window.toastr.success("onRename callback triggered: " + newName)
            })}
            {...(this.state.onDuplicate && {
              onDuplicate: () =>
                window.toastr.success("onDuplicate callback triggered")
            })}
            {...(this.state.onCreateNewFromSubsequence && {
              onCreateNewFromSubsequence: (selectedSeqData, props) => {
                console.info(selectedSeqData, props);
                window.toastr.success(
                  "onCreateNewFromSubsequence callback triggered"
                );
              }
            })}
            {...(this.state.onDelete && {
              onDelete: () =>
                window.toastr.success("onDelete callback triggered")
            })}
            {...(this.state.onCopy && {
              onCopy: function () {
                window.toastr.success("onCopy callback triggered");
              }
            })}
            {...(this.state.onPaste && {
              onPaste: function (event) {
                window.toastr.success("onPaste callback triggered");
                const clipboardData = event.clipboardData;
                let jsonData = clipboardData.getData("application/json");
                if (jsonData) {
                  jsonData = JSON.parse(jsonData);
                }
                const sequenceData = jsonData || {
                  sequence: clipboardData.getData("text/plain")
                };
                return sequenceData;
              }
            })}
            handleFullscreenClose={this.changeFullscreenMode}
            isFullscreen={isFullscreen}
            shouldAutosave={shouldAutosave}
            autoAnnotateFeatures={autoAnnotateFeatures}
            autoAnnotateParts={autoAnnotateParts}
            autoAnnotatePrimers={autoAnnotatePrimers}
            {...(adjustCircularLabelSpacing && { fontHeightMultiplier: 2 })}
            withRotateCircularView={this.state.withRotateCircularView}
            withZoomCircularView={this.state.withZoomCircularView}
            showReadOnly={this.state.showReadOnly}
            nameFontSizeCircularView={
              this.state.nameFontSizeCircularView ? 10 : undefined
            }
            showCircularity={!!this.state.showCircularity}
            showMoleculeType={this.state.showMoleculeType}
            showGCContentByDefault={this.state.showGCContentByDefault}
            onlyShowLabelsThatDoNotFit={this.state.onlyShowLabelsThatDoNotFit}
            GCDecimalDigits={this.state.GCDecimalDigits}
            showCicularViewInternalLabels={
              this.state.showCicularViewInternalLabels
            }
            showAvailability={this.state.showAvailability}
            {...(this.state.withVersionHistory && {
              getSequenceAtVersion: _versionId => {
                return {
                  sequence: exampleSequenceData.sequence
                };
              },
              getVersionList: () => {
                return [
                  {
                    dateChanged: new Date().toLocaleDateString(),
                    editedBy: "User",
                    versionId: 1
                  }
                ];
              }
            })}
          />
        </div>
      </React.Fragment>
    );
  }
}

const SimpleAlignDropdown = ({ toggleDropdown }) => {
  const [seq, setSeq] = useState(
    exampleSequenceData.sequence.substring(0, 500)
  );
  return (
    <div>
      <Callout intent="primary">
        Align the following sequence to the current sequence using biomsalign.
      </Callout>
      <br></br>
      <div>
        <textarea
          style={{ width: 300, height: 100 }}
          value={seq}
          onChange={e => setSeq(e.target.value)}
        ></textarea>
        <DialogFooter
          noCancel
          onClick={async () => {
            toggleDropdown();
            updateEditor(store, "DemoEditor", {
              panelsShown: immer(
                store.getState().VectorEditor.DemoEditor.panelsShown,
                panelsShown => {
                  panelsShown[0].push({
                    id: "simpleAlignment",
                    type: "alignment",
                    name: "Alignment",
                    active: true,
                    isFullscreen: false,
                    canClose: true
                  });
                }
              )
            });
            const [firstTrack, secondTrack] = await biomsa.align([
              store.getState().VectorEditor.DemoEditor.sequenceData.sequence,
              seq
            ]);
            addAlignment(store, {
              id: "simpleAlignment",
              alignmentType: "Sequence Alignment",
              name: "Alignment",
              alignmentAnnotationVisibility: {
                features: true,
                parts: true,
                translations: true
              },
              alignmentTracks: [
                {
                  sequenceData:
                    store.getState().VectorEditor.DemoEditor.sequenceData,
                  alignmentData: {
                    sequence: firstTrack
                  }
                },
                {
                  sequenceData: {
                    sequence: seq
                  },
                  alignmentData: {
                    sequence: secondTrack
                  }
                }
              ]
            });
          }}
        ></DialogFooter>
      </div>
    </div>
  );
};
