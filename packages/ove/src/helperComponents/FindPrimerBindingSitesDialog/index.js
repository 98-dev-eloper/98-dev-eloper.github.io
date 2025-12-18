import React, { useState, useMemo, useCallback } from "react";
import { reduxForm } from "redux-form";
import {
  wrapDialog,
  DataTable,
  InputField,
  CheckboxField,
  SelectField,
  NumericInputField,
  useTableEntities
} from "@teselagen/ui";
import { compose } from "redux";
import {
  Button,
  Classes,
  Callout,
  Intent,
  Collapse
} from "@blueprintjs/core";
import classNames from "classnames";
import withEditorProps from "../../withEditorProps";
import { findPrimerBindingSites } from "../../utils/findPrimerBindingSites";
import { useFormValue } from "../../utils/useFormValue";
import MeltingTemp from "../../StatusBar/MeltingTemp";
import {
  calculateTm,
  calculateNebTm,
  calculateSantaLuciaTm,
  getComplementSequenceString
} from "@teselagen/sequence-utils";
import useTmType from "../../utils/useTmType";
import "./style.css";

const dialogFormName = "FindPrimerBindingSitesDialog";
const dataTableFormName = "primerBindingSites";

// Default filter values for primer quality
const DEFAULT_FILTERS = {
  minLength: 18,
  maxLength: 30,
  minTm: 50,
  maxTm: 70,
  minGc: 35,
  maxGc: 65
};

// SnapGene-style primer arrow with sequence inside and mismatch bumps
const PrimerArrowWithSequence = ({
  forward,
  sequence,
  mismatchPositions = [],
  color
}) => {
  const charWidth = 10;
  const height = 18;
  const bumpHeight = 6;
  const arrowHeadWidth = 10;
  const primerLength = sequence.length;
  const bodyWidth = primerLength * charWidth;
  const totalWidth = bodyWidth + arrowHeadWidth;
  const svgHeight = height + bumpHeight * 2;

  // Y positions for path
  const yTop = bumpHeight;
  const yBottom = bumpHeight + height;
  const yMid = bumpHeight + height / 2;

  // Build the arrow path with bumps at mismatch positions
  const buildPath = () => {
    if (forward) {
      // Forward primer: arrow pointing right →
      let path = `M 0 ${yTop}`;

      // Top edge with bumps
      for (let i = 0; i < primerLength; i++) {
        const xStart = i * charWidth;
        const xEnd = (i + 1) * charWidth;
        const isMismatch = mismatchPositions.includes(i);

        if (isMismatch) {
          const xMid = xStart + charWidth / 2;
          path += ` L ${xMid} 0 L ${xEnd} ${yTop}`;
        } else {
          path += ` L ${xEnd} ${yTop}`;
        }
      }

      // Arrow head
      path += ` L ${bodyWidth} ${yTop} L ${totalWidth} ${yMid} L ${bodyWidth} ${yBottom}`;

      // Bottom edge with bumps (right to left)
      for (let i = primerLength - 1; i >= 0; i--) {
        const xStart = (i + 1) * charWidth;
        const xEnd = i * charWidth;
        const isMismatch = mismatchPositions.includes(i);

        if (isMismatch) {
          const xMid = xEnd + charWidth / 2;
          path += ` L ${xMid} ${svgHeight} L ${xEnd} ${yBottom}`;
        } else {
          path += ` L ${xEnd} ${yBottom}`;
        }
      }

      path += " Z";
      return path;
    } else {
      // Reverse primer: arrow pointing left ←
      let path = `M 0 ${yMid}`; // Arrow tip

      // Arrow head to top
      path += ` L ${arrowHeadWidth} ${yTop}`;

      // Top edge with bumps
      for (let i = 0; i < primerLength; i++) {
        const xStart = arrowHeadWidth + i * charWidth;
        const xEnd = arrowHeadWidth + (i + 1) * charWidth;
        const isMismatch = mismatchPositions.includes(i);

        if (isMismatch) {
          const xMid = xStart + charWidth / 2;
          path += ` L ${xMid} 0 L ${xEnd} ${yTop}`;
        } else {
          path += ` L ${xEnd} ${yTop}`;
        }
      }

      // Right side down
      path += ` L ${totalWidth} ${yBottom}`;

      // Bottom edge with bumps (right to left)
      for (let i = primerLength - 1; i >= 0; i--) {
        const xStart = arrowHeadWidth + (i + 1) * charWidth;
        const xEnd = arrowHeadWidth + i * charWidth;
        const isMismatch = mismatchPositions.includes(i);

        if (isMismatch) {
          const xMid = xEnd + charWidth / 2;
          path += ` L ${xMid} ${svgHeight} L ${xEnd} ${yBottom}`;
        } else {
          path += ` L ${xEnd} ${yBottom}`;
        }
      }

      // Arrow head to tip
      path += ` L ${arrowHeadWidth} ${yBottom} Z`;

      return path;
    }
  };

  // Calculate x position for each character
  const getCharX = index => {
    if (forward) {
      return index * charWidth + charWidth / 2;
    } else {
      return arrowHeadWidth + index * charWidth + charWidth / 2;
    }
  };

  return (
    <svg
      width={totalWidth}
      height={svgHeight}
      style={{ display: "block" }}
    >
      {/* Arrow background */}
      <path d={buildPath()} fill={color} opacity={0.8} />

      {/* Sequence text inside arrow */}
      {sequence.split("").map((base, i) => {
        const isMismatch = mismatchPositions.includes(i);
        return (
          <text
            key={i}
            x={getCharX(i)}
            y={yMid + 4}
            textAnchor="middle"
            fontSize="11"
            fontFamily="monospace"
            fontWeight={isMismatch ? "bold" : "normal"}
            fill={isMismatch ? "#c23030" : "#ffffff"}
          >
            {base.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
};

// Component to show sequence with custom primer visualization (SnapGene style)
const SequencePreview = ({ site, fullSequence, sequenceLength }) => {
  const contextBases = 20; // Show ~20 bases on each side for fuller line
  const charWidth = 10; // Must match PrimerArrowWithSequence charWidth

  if (!site || !fullSequence) {
    return (
      <div className="tg-sequence-preview-empty">
        Click a row to see sequence context
      </div>
    );
  }

  const { start, end, forward, primerSequence, mismatchPositions = [] } = site;

  // Calculate the range to display with context
  const displayStart = Math.max(0, start - contextBases);
  const displayEnd = Math.min(sequenceLength - 1, end + contextBases);

  // Get sequences
  const beforeSeq = fullSequence.slice(displayStart, start);
  const bindingSeq = fullSequence.slice(start, end + 1);
  const afterSeq = fullSequence.slice(end + 1, displayEnd + 1);

  // Get complement strands
  const beforeComp = getComplementSequenceString(beforeSeq);
  const bindingComp = getComplementSequenceString(bindingSeq);
  const afterComp = getComplementSequenceString(afterSeq);

  const color = forward ? "#31b231" : "#3182ce";

  // Render sequence with monospace characters aligned to the same width as primer arrow
  const renderSeqChars = (seq, isBinding, isMismatchCheck) => {
    return seq.split("").map((base, i) => {
      const isMismatch = isBinding && isMismatchCheck && mismatchPositions.includes(i);
      return (
        <span
          key={i}
          className={classNames("tg-seq-char", {
            "tg-mismatch-char": isMismatch,
            "tg-binding-char": isBinding && !isMismatch
          })}
          style={{ width: charWidth, display: "inline-block", textAlign: "center" }}
        >
          {base.toUpperCase()}
        </span>
      );
    });
  };

  return (
    <div className="tg-sequence-preview">
      <div className="tg-sequence-preview-header">
        <span className="tg-preview-position">
          Position: {start + 1} - {end + 1}
        </span>
        <span className="tg-preview-strand">
          Strand: {forward ? "(+) Forward" : "(-) Reverse"}
        </span>
        {mismatchPositions.length > 0 && (
          <span className="tg-preview-mismatches">
            Mismatches: {mismatchPositions.length}
          </span>
        )}
      </div>

      <div className="tg-sequence-display-snapgene">
        {/* Forward primer arrow with sequence (above template) */}
        {forward && (
          <div className="tg-primer-row-snapgene">
            <span className="tg-strand-label-snapgene" />
            <span className="tg-spacer" style={{ width: beforeSeq.length * charWidth }} />
            <PrimerArrowWithSequence
              forward={true}
              sequence={primerSequence}
              mismatchPositions={mismatchPositions}
              color={color}
            />
          </div>
        )}

        {/* 5' to 3' template strand */}
        <div className="tg-template-row">
          <span className="tg-strand-label-snapgene">5'</span>
          <span className="tg-template-seq">
            {renderSeqChars(beforeSeq, false, false)}
            {renderSeqChars(bindingSeq, true, forward)}
            {renderSeqChars(afterSeq, false, false)}
          </span>
          <span className="tg-strand-label-snapgene">3'</span>
        </div>

        {/* 3' to 5' complement strand */}
        <div className="tg-template-row">
          <span className="tg-strand-label-snapgene">3'</span>
          <span className="tg-template-seq">
            {renderSeqChars(beforeComp, false, false)}
            {renderSeqChars(bindingComp, true, !forward)}
            {renderSeqChars(afterComp, false, false)}
          </span>
          <span className="tg-strand-label-snapgene">5'</span>
        </div>

        {/* Reverse primer arrow with sequence (below template) */}
        {!forward && (
          <div className="tg-primer-row-snapgene">
            <span className="tg-strand-label-snapgene" />
            {/* Subtract arrowHeadWidth (10px) since reverse arrow has head on left */}
            <span className="tg-spacer" style={{ width: Math.max(0, beforeSeq.length * charWidth - 10) }} />
            <PrimerArrowWithSequence
              forward={false}
              sequence={primerSequence}
              mismatchPositions={mismatchPositions}
              color={color}
            />
          </div>
        )}

        {/* Position axis */}
        <div className="tg-axis-row-snapgene">
          <span className="tg-strand-label-snapgene" />
          <span className="tg-axis-numbers">
            <span className="tg-axis-tick-start">{displayStart + 1}</span>
            <span
              className="tg-axis-tick-center"
              style={{ left: beforeSeq.length * charWidth + (bindingSeq.length * charWidth) / 2 }}
            >
              {start + 1}...{end + 1}
            </span>
            <span
              className="tg-axis-tick-end"
              style={{ left: (beforeSeq.length + bindingSeq.length + afterSeq.length) * charWidth }}
            >
              {displayEnd + 1}
            </span>
          </span>
        </div>
      </div>

      <div className="tg-sequence-legend">
        <span>
          <span className="tg-legend-sample" style={{ background: color }} />
          Primer ({forward ? "Forward" : "Reverse"})
        </span>
        {mismatchPositions.length > 0 && (
          <span>
            <span className="tg-legend-sample tg-mismatch-sample" />
            Mismatch ({mismatchPositions.length})
          </span>
        )}
      </div>
    </div>
  );
};

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

  // Filter values
  const minLength = useFormValue(dialogFormName, "minLength");
  const maxLength = useFormValue(dialogFormName, "maxLength");
  const minTm = useFormValue(dialogFormName, "minTm");
  const maxTm = useFormValue(dialogFormName, "maxTm");
  const minGc = useFormValue(dialogFormName, "minGc");
  const maxGc = useFormValue(dialogFormName, "maxGc");
  const enableFilters = useFormValue(dialogFormName, "enableFilters");

  const [bindingSites, setBindingSites] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSiteForPreview, setSelectedSiteForPreview] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Use the same Tm calculation method as MeltingTemp component
  const [tmType] = useTmType();
  const getTmCalculator = useCallback(() => {
    return tmType === "neb_tm"
      ? calculateNebTm
      : tmType === "default"
        ? calculateSantaLuciaTm
        : calculateTm;
  }, [tmType]);

  const handleSearch = useCallback(() => {
    if (!primerSequence || primerSequence.length < 5) {
      window.toastr.warning("Primer sequence must be at least 5 bases long");
      return;
    }

    const tmCalculator = getTmCalculator();
    const results = findPrimerBindingSites({
      primerSequence: primerSequence,
      fullSequence: sequenceData.sequence,
      maxMismatches: parseInt(maxMismatches) || 0,
      searchReverseStrand: searchReverseStrand !== false,
      isCircular: sequenceData.circular,
      calculateTm: seq => {
        try {
          return tmCalculator(seq);
        } catch {
          return null;
        }
      }
    });

    setBindingSites(results);
    setHasSearched(true);

    // Auto-select first result for preview
    if (results.length > 0) {
      setSelectedSiteForPreview(results[0].id);
    } else {
      setSelectedSiteForPreview(null);
      window.toastr.info("No binding sites found");
    }
  }, [
    primerSequence,
    sequenceData.sequence,
    sequenceData.circular,
    maxMismatches,
    searchReverseStrand,
    getTmCalculator
  ]);

  // Filter binding sites based on quality criteria
  const filteredBindingSites = useMemo(() => {
    if (!enableFilters) return bindingSites;

    // Use actual values or defaults
    const effectiveMinLength = minLength ?? DEFAULT_FILTERS.minLength;
    const effectiveMaxLength = maxLength ?? DEFAULT_FILTERS.maxLength;
    const effectiveMinTm = minTm ?? DEFAULT_FILTERS.minTm;
    const effectiveMaxTm = maxTm ?? DEFAULT_FILTERS.maxTm;
    const effectiveMinGc = minGc ?? DEFAULT_FILTERS.minGc;
    const effectiveMaxGc = maxGc ?? DEFAULT_FILTERS.maxGc;

    return bindingSites.filter(site => {
      const length = site.primerSequence.length;
      const tm = site.tm;
      const gc = site.gcPercent;

      // Length filter
      if (length < effectiveMinLength) return false;
      if (length > effectiveMaxLength) return false;

      // Tm filter (only apply if Tm is available)
      if (tm !== null && typeof tm === "number") {
        if (tm < effectiveMinTm) return false;
        if (tm > effectiveMaxTm) return false;
      }

      // GC% filter (only apply if GC is available)
      if (gc !== null && typeof gc === "number") {
        if (gc < effectiveMinGc) return false;
        if (gc > effectiveMaxGc) return false;
      }

      return true;
    });
  }, [
    bindingSites,
    enableFilters,
    minLength,
    maxLength,
    minTm,
    maxTm,
    minGc,
    maxGc
  ]);

  const handleCreatePrimers = useCallback(() => {
    const selectedSites = Object.keys(selectedEntities || {})
      .map(id => filteredBindingSites.find(site => site.id === id))
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
          name: selectedSites.length > 1 ? `${baseName}_${i + 1}` : baseName,
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
    filteredBindingSites,
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
          displayName: "Mis",
          type: "number"
        },
        {
          path: "tm",
          displayName: "Tm",
          type: "string",
          render: val =>
            val != null && typeof val === "number" ? `${val.toFixed(1)}°C` : "-"
        },
        {
          path: "gcPercent",
          displayName: "GC%",
          type: "string",
          render: val => (val != null ? `${val.toFixed(1)}%` : "-")
        },
        {
          path: "matchedSequence",
          displayName: "Sequence",
          type: "string",
          render: val =>
            val
              ? val.length > 12
                ? `${val.substring(0, 10)}...`
                : val
              : "-"
        }
      ]
    }),
    []
  );

  const selectedCount = Object.keys(selectedEntities || {}).length;
  const selectedIds = useMemo(
    () => filteredBindingSites.map(s => s.id),
    [filteredBindingSites]
  );

  const previewSiteData = useMemo(() => {
    if (!selectedSiteForPreview) return null;
    return filteredBindingSites.find(s => s.id === selectedSiteForPreview);
  }, [selectedSiteForPreview, filteredBindingSites]);

  const filteredOutCount = bindingSites.length - filteredBindingSites.length;

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

      {/* Quality Filters */}
      <div className="tg-filter-section">
        <Button
          minimal
          small
          icon={showFilters ? "chevron-down" : "chevron-right"}
          onClick={() => setShowFilters(!showFilters)}
          className="tg-filter-toggle"
        >
          Quality Filters
          {enableFilters && filteredOutCount > 0 && (
            <span className="tg-filter-badge">
              {filteredOutCount} filtered out
            </span>
          )}
        </Button>

        <Collapse isOpen={showFilters}>
          <div className="tg-filter-options">
            <CheckboxField
              name="enableFilters"
              label="Enable quality filtering"
              defaultValue={false}
            />

            {enableFilters && (
              <div className="tg-filter-grid">
                <div className="tg-filter-row">
                  <span className="tg-filter-label">Length (bp):</span>
                  <NumericInputField
                    name="minLength"
                    placeholder="Min"
                    defaultValue={DEFAULT_FILTERS.minLength}
                    min={5}
                    max={50}
                  />
                  <span>-</span>
                  <NumericInputField
                    name="maxLength"
                    placeholder="Max"
                    defaultValue={DEFAULT_FILTERS.maxLength}
                    min={5}
                    max={50}
                  />
                </div>

                <div className="tg-filter-row">
                  <span className="tg-filter-label">Tm (C):</span>
                  <NumericInputField
                    name="minTm"
                    placeholder="Min"
                    defaultValue={DEFAULT_FILTERS.minTm}
                    min={0}
                    max={100}
                  />
                  <span>-</span>
                  <NumericInputField
                    name="maxTm"
                    placeholder="Max"
                    defaultValue={DEFAULT_FILTERS.maxTm}
                    min={0}
                    max={100}
                  />
                </div>

                <div className="tg-filter-row">
                  <span className="tg-filter-label">GC (%):</span>
                  <NumericInputField
                    name="minGc"
                    placeholder="Min"
                    defaultValue={DEFAULT_FILTERS.minGc}
                    min={0}
                    max={100}
                  />
                  <span>-</span>
                  <NumericInputField
                    name="maxGc"
                    placeholder="Max"
                    defaultValue={DEFAULT_FILTERS.maxGc}
                    min={0}
                    max={100}
                  />
                </div>
              </div>
            )}
          </div>
        </Collapse>
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
            Found {filteredBindingSites.length} binding site
            {filteredBindingSites.length !== 1 ? "s" : ""}
            {enableFilters && filteredOutCount > 0 && (
              <span className="tg-filtered-info">
                ({filteredOutCount} filtered out)
              </span>
            )}
            :
          </div>

          {filteredBindingSites.length > 0 ? (
            <div className="tg-results-container-vertical">
              {/* Top: Sequence Preview */}
              <SequencePreview
                site={previewSiteData}
                fullSequence={sequenceData.sequence}
                sequenceLength={sequenceData.sequence.length}
              />

              {/* Bottom: Data Table */}
              <div className="tg-results-table">
                <DataTable
                  noPadding
                  withCheckboxes
                  noFullscreenButton
                  maxHeight={180}
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
                  entities={filteredBindingSites}
                  onRowClick={(e, row) => setSelectedSiteForPreview(row.id)}
                />
              </div>
            </div>
          ) : (
            <Callout intent={Intent.WARNING}>
              No binding sites found.{" "}
              {enableFilters
                ? "Try adjusting the quality filters or mismatch tolerance."
                : "Try adjusting the mismatch tolerance or check the primer sequence."}
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
    width: 700,
    title: "Find Primer Binding Sites"
  }),
  withEditorProps,
  reduxForm({
    form: dialogFormName,
    initialValues: {
      searchReverseStrand: true,
      maxMismatches: "0",
      enableFilters: false,
      minLength: DEFAULT_FILTERS.minLength,
      maxLength: DEFAULT_FILTERS.maxLength,
      minTm: DEFAULT_FILTERS.minTm,
      maxTm: DEFAULT_FILTERS.maxTm,
      minGc: DEFAULT_FILTERS.minGc,
      maxGc: DEFAULT_FILTERS.maxGc
    }
  })
)(FindPrimerBindingSitesDialog);
