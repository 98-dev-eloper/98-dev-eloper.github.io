import React, { useState, useMemo, useCallback } from "react";
import { reduxForm } from "redux-form";
import {
  wrapDialog,
  DataTable,
  InputField,
  CheckboxField,
  SelectField,
  useTableEntities
} from "@teselagen/ui";
import { compose } from "redux";
import { Button, Classes, Callout, Intent } from "@blueprintjs/core";
import classNames from "classnames";
import withEditorProps from "../../withEditorProps";
import { findPrimerBindingSites } from "../../utils/findPrimerBindingSites";
import { useFormValue } from "../../utils/useFormValue";
import MeltingTemp from "../../StatusBar/MeltingTemp";
import "./style.css";

const dialogFormName = "FindPrimerBindingSitesDialog";
const dataTableFormName = "primerBindingSites";

const FindPrimerBindingSitesDialog = props => {
  const {
    sequenceData = { sequence: "" },
    hideModal,
    upsertPrimer,
    annotationVisibilityShow
  } = props;

  const { selectedEntities } = useTableEntities(dataTableFormName);

  const primerName = useFormValue(dialogFormName, "primerName");
  const primerSequence = useFormValue(dialogFormName, "primerSequence");
  const searchReverseStrand = useFormValue(
    dialogFormName,
    "searchReverseStrand"
  );
  const maxMismatches = useFormValue(dialogFormName, "maxMismatches");

  const [bindingSites, setBindingSites] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(() => {
    if (!primerSequence || primerSequence.length < 5) {
      window.toastr.warning("Primer sequence must be at least 5 bases long");
      return;
    }

    const results = findPrimerBindingSites({
      primerSequence: primerSequence,
      fullSequence: sequenceData.sequence,
      maxMismatches: parseInt(maxMismatches) || 0,
      searchReverseStrand: searchReverseStrand !== false,
      isCircular: sequenceData.circular
    });

    setBindingSites(results);
    setHasSearched(true);

    if (results.length === 0) {
      window.toastr.info("No binding sites found");
    }
  }, [
    primerSequence,
    sequenceData.sequence,
    sequenceData.circular,
    maxMismatches,
    searchReverseStrand
  ]);

  const handleCreatePrimers = useCallback(() => {
    const selectedSites = Object.keys(selectedEntities || {})
      .map(id => bindingSites.find(site => site.id === id))
      .filter(Boolean);

    if (selectedSites.length === 0) {
      window.toastr.warning("Please select at least one binding site");
      return;
    }

    const baseName = primerName || "Primer";

    selectedSites.forEach((site, i) => {
      const conditionals = {
        ...(i === 0 && { batchUndoStart: true }),
        ...(i === selectedSites.length - 1 && { batchUndoEnd: true }),
        ...(i > 0 && i < selectedSites.length - 1 && { batchUndoMiddle: true })
      };

      upsertPrimer(
        {
          name:
            selectedSites.length > 1 ? `${baseName}_${i + 1}` : baseName,
          start: site.start,
          end: site.end,
          forward: site.forward,
          type: "primer_bind",
          bases: site.primerSequence,
          strand: site.forward ? 1 : -1
        },
        conditionals
      );
    });

    annotationVisibilityShow("primers");
    window.toastr.success(
      `Successfully created ${selectedSites.length} primer${selectedSites.length > 1 ? "s" : ""}`
    );
    hideModal();
  }, [
    selectedEntities,
    bindingSites,
    primerName,
    upsertPrimer,
    annotationVisibilityShow,
    hideModal
  ]);

  const schema = useMemo(
    () => ({
      fields: [
        {
          path: "position",
          displayName: "Position",
          type: "string",
          render: (val, record) => `${record.start + 1}-${record.end + 1}`
        },
        {
          path: "strand",
          displayName: "Strand",
          type: "string",
          render: val => (val === "+" ? "(+)" : "(-)")
        },
        {
          path: "numMismatches",
          displayName: "Mismatch",
          type: "number"
        },
        {
          path: "tm",
          displayName: "Tm",
          type: "string",
          render: (val, record) => (
            <MeltingTemp
              sequence={record.primerSequence}
              InnerWrapper={({ children }) => <span>{children}</span>}
            />
          )
        },
        {
          path: "gcPercent",
          displayName: "GC%",
          type: "string",
          render: val => (val != null ? `${val.toFixed(1)}%` : "-")
        },
        {
          path: "stability3Prime",
          displayName: "3' Stab",
          type: "string",
          render: val => (val != null ? `${val}` : "-")
        },
        {
          path: "matchedSequence",
          displayName: "Sequence",
          type: "string",
          render: val =>
            val
              ? val.length > 15
                ? `${val.substring(0, 12)}...`
                : val
              : "-"
        }
      ]
    }),
    []
  );

  const selectedCount = Object.keys(selectedEntities || {}).length;
  const selectedIds = useMemo(() => bindingSites.map(s => s.id), [bindingSites]);

  return (
    <div
      className={classNames(
        Classes.DIALOG_BODY,
        "tg-min-width-dialog",
        "tg-find-primer-binding-sites-dialog"
      )}
    >
      <InputField
        name="primerName"
        label="Primer Name"
        placeholder="Enter primer name"
        defaultValue=""
      />

      <InputField
        name="primerSequence"
        label="Primer Sequence (5' to 3')"
        placeholder="Enter primer sequence (e.g., ATCGATCGATCG)"
        defaultValue=""
        className="tg-primer-sequence-input"
      />

      <div className="tg-search-options">
        <CheckboxField
          name="searchReverseStrand"
          label="Search Reverse Strand"
          defaultValue={true}
        />

        <SelectField
          name="maxMismatches"
          label="Allowed Mismatches"
          defaultValue="0"
          options={[
            { label: "0 (Exact match)", value: "0" },
            { label: "1 mismatch", value: "1" },
            { label: "2 mismatches", value: "2" }
          ]}
        />
      </div>

      <Button
        intent={Intent.PRIMARY}
        icon="search"
        onClick={handleSearch}
        disabled={!primerSequence || primerSequence.length < 5}
        className="tg-search-button"
      >
        Search
      </Button>

      {hasSearched && (
        <div className="tg-results-section">
          <div className="tg-results-header">
            Found {bindingSites.length} binding site
            {bindingSites.length !== 1 ? "s" : ""}:
          </div>

          {bindingSites.length > 0 ? (
            <>
              <DataTable
                noPadding
                withCheckboxes
                noFullscreenButton
                maxHeight={300}
                selectedIds={selectedIds}
                formName={dataTableFormName}
                noRouter
                noRowsFoundMessage="No binding sites found"
                compact
                noHeader
                noFooter
                withSearch={false}
                hideSelectedCount
                isInfinite
                schema={schema}
                entities={bindingSites}
              />

              <div className="tg-action-buttons">
                <Button
                  minimal
                  onClick={() => {
                    // Select all - handled by DataTable internally
                  }}
                >
                  Select All
                </Button>
                <Button
                  minimal
                  onClick={() => {
                    // Deselect all - handled by DataTable internally
                  }}
                >
                  Deselect All
                </Button>
              </div>
            </>
          ) : (
            <Callout intent={Intent.WARNING}>
              No binding sites found. Try adjusting the mismatch tolerance or
              check the primer sequence.
            </Callout>
          )}
        </div>
      )}

      <div className="tg-dialog-footer">
        <Button onClick={hideModal}>Cancel</Button>
        <Button
          intent={Intent.PRIMARY}
          onClick={handleCreatePrimers}
          disabled={selectedCount === 0}
        >
          Create {selectedCount > 0 ? selectedCount : ""} Primer
          {selectedCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
};

export default compose(
  wrapDialog({
    isDraggable: true,
    width: 600,
    title: "Find Primer Binding Sites"
  }),
  withEditorProps,
  reduxForm({ form: dialogFormName })
)(FindPrimerBindingSitesDialog);
