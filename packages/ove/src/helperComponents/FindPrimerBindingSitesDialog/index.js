import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { reduxForm, change } from "redux-form";
import {
  wrapDialog,
  DataTable,
  InputField,
  useTableEntities
} from "@teselagen/ui";
import { compose } from "redux";
import { connect } from "react-redux";
import {
  Button,
  Classes,
  Callout,
  Intent
} from "@blueprintjs/core";
import classNames from "classnames";
import withEditorProps from "../../withEditorProps";
import { findPrimerBindingSites } from "../../utils/findPrimerBindingSites";
import { useFormValue } from "../../utils/useFormValue";
import {
  calculateTm,
  calculateNebTm,
  calculateSantaLuciaTm,
  getComplementSequenceString,
  getReverseComplementSequenceString
} from "@teselagen/sequence-utils";
import useTmType from "../../utils/useTmType";
import "./style.css";

const dialogFormName = "FindPrimerBindingSitesDialog";
const dataTableFormName = "primerBindingSites";

// Primer arrow that shows non-binding positions bent up (forward) or down (reverse)
// Only positions in fullPrimerMismatchPositions are shown raised with diagonal connectors
// Positions that match template stay at normal binding level
const PrimerArrowWithMismatches = ({
  forward,
  primerSequence,
  fullPrimerMismatchPositions = [], // positions in full primer that don't match template
  color
}) => {
  const charWidth = 10;
  const height = 16;
  const floatOffset = 14; // Height offset for non-binding (floating) positions
  const arrowHeadWidth = 8;

  if (!primerSequence) return null;

  const seqLength = primerSequence.length;
  const seqWidth = seqLength * charWidth;
  const totalWidth = seqWidth + arrowHeadWidth;

  // For reverse primers, we need to reverse the display order
  // because the arrow points left (5' on right, 3' on left)
  // The sequence should read 5'→3' from right to left
  const displaySequence = forward ? primerSequence : primerSequence.split("").reverse().join("");
  const displayMismatchPositions = forward
    ? fullPrimerMismatchPositions
    : fullPrimerMismatchPositions.map(pos => seqLength - 1 - pos);

  // Check if there are any non-binding positions
  const hasNonBinding = displayMismatchPositions.length > 0;
  const totalHeight = hasNonBinding ? height + floatOffset + 4 : height + 10;

  // Y positions for binding level (on template) vs floating level (off template)
  // Forward: floating goes UP (lower Y), binding at bottom
  // Reverse: floating goes DOWN (higher Y), binding at top
  const bindingY = forward ? floatOffset : 0;
  const floatY = forward ? 0 : floatOffset;
  const bindingMidY = bindingY + height / 2;

  // Helper to check if a position is non-binding (using display positions)
  const isNonBinding = (pos) => displayMismatchPositions.includes(pos);

  // Build SVG path that shows binding positions at one level and non-binding raised/lowered
  const buildPath = () => {
    if (!hasNonBinding) {
      // Simple arrow without any floating regions
      const yTop = 5;
      const yBottom = 5 + height;
      const yMid = 5 + height / 2;

      if (forward) {
        let path = `M 0 ${yTop}`;
        path += ` L ${seqWidth} ${yTop}`;
        path += ` L ${seqWidth + arrowHeadWidth} ${yMid}`;
        path += ` L ${seqWidth} ${yBottom}`;
        path += ` L 0 ${yBottom} Z`;
        return path;
      } else {
        let path = `M 0 ${yMid}`;
        path += ` L ${arrowHeadWidth} ${yTop}`;
        path += ` L ${arrowHeadWidth + seqWidth} ${yTop}`;
        path += ` L ${arrowHeadWidth + seqWidth} ${yBottom}`;
        path += ` L ${arrowHeadWidth} ${yBottom} Z`;
        return path;
      }
    }

    // Complex path with floating regions
    // Group consecutive positions by binding state
    const segments = [];
    let currentSegment = { start: 0, isNonBinding: isNonBinding(0) };

    for (let i = 1; i < seqLength; i++) {
      const posIsNonBinding = isNonBinding(i);
      if (posIsNonBinding !== currentSegment.isNonBinding) {
        currentSegment.end = i - 1;
        segments.push(currentSegment);
        currentSegment = { start: i, isNonBinding: posIsNonBinding };
      }
    }
    currentSegment.end = seqLength - 1;
    segments.push(currentSegment);

    // Build the path
    const xOffset = forward ? 0 : arrowHeadWidth;

    // Top edge path (left to right)
    let topPath = "";
    let bottomPath = "";

    segments.forEach((seg, idx) => {
      const startX = xOffset + seg.start * charWidth;
      const endX = xOffset + (seg.end + 1) * charWidth;
      const yTop = seg.isNonBinding ? floatY : bindingY;
      const yBottom = seg.isNonBinding ? floatY + height : bindingY + height;

      if (idx === 0) {
        // First segment - start the path
        topPath = `M ${startX} ${yTop}`;
      } else {
        // Connect from previous segment with diagonal
        const prevSeg = segments[idx - 1];
        const prevYTop = prevSeg.isNonBinding ? floatY : bindingY;
        // Diagonal connector from prev to current
        topPath += ` L ${startX} ${yTop}`;
      }

      // Draw top of this segment
      topPath += ` L ${endX} ${yTop}`;
    });

    // Arrow head
    if (forward) {
      topPath += ` L ${seqWidth + arrowHeadWidth} ${bindingMidY}`;
    }

    // Bottom edge path (right to left)
    for (let idx = segments.length - 1; idx >= 0; idx--) {
      const seg = segments[idx];
      const startX = xOffset + seg.start * charWidth;
      const endX = xOffset + (seg.end + 1) * charWidth;
      const yBottom = seg.isNonBinding ? floatY + height : bindingY + height;

      if (idx === segments.length - 1) {
        // Start bottom path from right
        bottomPath = ` L ${endX} ${yBottom}`;
      } else {
        // Connect from previous (right) segment with diagonal
        bottomPath += ` L ${endX} ${yBottom}`;
      }

      // Draw bottom of this segment
      bottomPath += ` L ${startX} ${yBottom}`;
    }

    // Close the path
    if (!forward) {
      // For reverse, add arrow head at start
      const firstSeg = segments[0];
      const firstYTop = firstSeg.isNonBinding ? floatY : bindingY;
      const firstYBottom = firstSeg.isNonBinding ? floatY + height : bindingY + height;
      return `M 0 ${bindingMidY} L ${arrowHeadWidth} ${firstYTop}` + topPath.substring(topPath.indexOf(" L", 1)) + bottomPath + ` L ${arrowHeadWidth} ${firstYBottom} Z`;
    }

    return topPath + bottomPath + " Z";
  };

  // Render text for each position
  const renderText = () => {
    const xOffset = forward ? 0 : arrowHeadWidth;

    return displaySequence.split("").map((base, i) => {
      const posIsNonBinding = isNonBinding(i);
      const yPos = hasNonBinding
        ? (posIsNonBinding ? floatY + height / 2 + 4 : bindingY + height / 2 + 4)
        : 5 + height / 2 + 4;

      return (
        <text
          key={i}
          x={xOffset + i * charWidth + charWidth / 2}
          y={yPos}
          textAnchor="middle"
          fontSize="10"
          fontFamily="monospace"
          fontWeight={posIsNonBinding ? "bold" : "normal"}
          fill={posIsNonBinding ? "#c23030" : "#ffffff"}
        >
          {base.toUpperCase()}
        </text>
      );
    });
  };

  return (
    <svg
      width={totalWidth}
      height={totalHeight}
      style={{ display: "block" }}
    >
      <path d={buildPath()} fill={color} opacity={0.85} stroke={color} strokeWidth="0.5" />
      {renderText()}
    </svg>
  );
};

// Component to show sequence with custom primer visualization (SnapGene style)
// Now uses fullPrimerMismatchPositions to show which bases don't match template
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

  const {
    start,
    end,
    forward,
    primerSequence,
    fullPrimerMismatchPositions = []
  } = site;

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
  const nonBindingCount = fullPrimerMismatchPositions.length;

  // Render sequence with monospace characters aligned to the same width as primer arrow
  const renderSeqChars = (seq, isBinding, isMismatchCheck, bindingMismatchPositions) => {
    return seq.split("").map((base, i) => {
      const isMismatch = isBinding && isMismatchCheck && bindingMismatchPositions.includes(i);
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

  // Convert fullPrimerMismatchPositions to template binding region positions for display
  // fullPrimerMismatchPositions are positions in the full primer sequence (includes overhang)
  // We need to map them to positions in bindingSeq (the matched template region)
  // IMPORTANT: Only include actual mismatches, NOT overhang positions
  const { overhangLength = 0, mismatchPositions: siteMismatchPositions = [] } = site;

  const bindingMismatchPositions = [];

  if (forward) {
    // Forward primer: overhang at 5' end (left), binding at 3' end (right)
    // Primer:  [overhang][binding region]
    // Template alignment: primer directly matches template
    // siteMismatchPositions are relative to binding sequence (0 = first base of binding)
    siteMismatchPositions.forEach(pos => {
      if (pos >= 0 && pos < bindingSeq.length) {
        bindingMismatchPositions.push(pos);
      }
    });
  } else {
    // Reverse primer: overhang at 5' end (left), binding at 3' end (right)
    // Primer:       [overhang][binding region]
    // But displayed reversed: [binding reversed][overhang reversed]
    // And binds to - strand, so template shows complement
    //
    // siteMismatchPositions are in binding sequence coordinates
    // For template display, we need to show where mismatches occur
    // Template bindingSeq is + strand, primer binding is on - strand
    // When reverse primer binds to - strand:
    //   - primer[last] (3' end) binds to -strand at position 'start' on + strand
    //   - primer[overhangLength] (start of binding) binds to -strand at position 'end' on + strand
    //
    // siteMismatchPositions[i] is relative to binding sequence of original primer
    // In template, position 0 of binding corresponds to primer's binding end
    // So we need to reverse the position: bindingSeq.length - 1 - pos
    siteMismatchPositions.forEach(pos => {
      if (pos >= 0 && pos < bindingSeq.length) {
        // Reverse the position for template display
        bindingMismatchPositions.push(bindingSeq.length - 1 - pos);
      }
    });
  }

  return (
    <div className="tg-sequence-preview">
      <div className="tg-sequence-preview-header">
        <span className="tg-preview-position">
          Position: {start + 1} - {end + 1}
        </span>
        <span className="tg-preview-strand">
          Strand: {forward ? "(+) Forward" : "(-) Reverse"}
        </span>
        {nonBindingCount > 0 && (
          <span className="tg-preview-mismatches">
            Non-binding: {nonBindingCount}bp
          </span>
        )}
      </div>

      <div className="tg-sequence-display-snapgene">
        {/* Forward primer arrow with sequence (above template) */}
        {forward && (
          <div className="tg-primer-row-snapgene" style={{ position: "relative" }}>
            <span className="tg-strand-label-snapgene" />
            {/* For forward primer with 5' overhang, the primer extends BEFORE the binding region
                So we need to adjust spacer to account for overhang extending left */}
            <span className="tg-spacer" style={{ width: Math.max(0, (beforeSeq.length - overhangLength) * charWidth) }} />
            <PrimerArrowWithMismatches
              forward={true}
              primerSequence={primerSequence}
              fullPrimerMismatchPositions={fullPrimerMismatchPositions}
              color={color}
            />
          </div>
        )}

        {/* 5' to 3' template strand */}
        <div className="tg-template-row">
          <span className="tg-strand-label-snapgene">5'</span>
          <span className="tg-template-seq">
            {renderSeqChars(beforeSeq, false, false, [])}
            {renderSeqChars(bindingSeq, true, forward, bindingMismatchPositions)}
            {renderSeqChars(afterSeq, false, false, [])}
          </span>
          <span className="tg-strand-label-snapgene">3'</span>
        </div>

        {/* 3' to 5' complement strand */}
        <div className="tg-template-row">
          <span className="tg-strand-label-snapgene">3'</span>
          <span className="tg-template-seq">
            {renderSeqChars(beforeComp, false, false, [])}
            {renderSeqChars(bindingComp, true, !forward, bindingMismatchPositions)}
            {renderSeqChars(afterComp, false, false, [])}
          </span>
          <span className="tg-strand-label-snapgene">5'</span>
        </div>

        {/* Reverse primer arrow with sequence (below template) */}
        {!forward && (
          <div className="tg-primer-row-snapgene" style={{ position: "relative" }}>
            <span className="tg-strand-label-snapgene" />
            {/* Reverse primer alignment:
                - Binding region is from start to end on + strand
                - Primer's 3' end (last base) is at template position 'start'
                - Overhang (5' end of primer) extends AFTER the binding region (to the right)

                displaySequence = reverse(primer), so displaySequence[0] = primer's 3' end (last base)
                displaySequence[0] should align with template position 'start'

                Arrow structure: [arrowhead 8px][displaySequence]
                displaySequence[0] is at position (spacer + 8)
                template[start] is at position (beforeSeq.length * charWidth)

                So: spacer + 8 = beforeSeq.length * charWidth
                    spacer = beforeSeq.length * charWidth - 8 */}
            <span className="tg-spacer" style={{ width: Math.max(0, beforeSeq.length * charWidth - 8) }} />
            <PrimerArrowWithMismatches
              forward={false}
              primerSequence={primerSequence}
              fullPrimerMismatchPositions={fullPrimerMismatchPositions}
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
          Primer ({primerSequence?.length || 0}bp)
        </span>
        {nonBindingCount > 0 && (
          <span>
            <span className="tg-legend-sample tg-mismatch-sample" />
            Non-binding ({nonBindingCount}bp)
          </span>
        )}
      </div>
    </div>
  );
};

// Custom input component that shows colored text for non-binding positions
// Shows all positions that don't match the template (both in overhang and binding regions)
// Only allows A, T, G, C characters
const HighlightedPrimerInput = ({ value, onChange, selectedSite, placeholder }) => {
  const inputRef = useRef(null);
  const [cursorPosition, setCursorPosition] = useState(null);

  const { fullPrimerMismatchPositions = [] } = selectedSite || {};

  const hasHighlights = selectedSite && fullPrimerMismatchPositions.length > 0;
  const normalizedValue = (value || "").toUpperCase().replace(/\s/g, "");

  // Restore cursor position after value change
  useEffect(() => {
    if (cursorPosition !== null && inputRef.current) {
      inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, [value, cursorPosition]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    // Filter to only allow A, T, G, C (case insensitive)
    const filteredValue = newValue.toUpperCase().replace(/[^ATGC]/g, "");
    const cursorPos = e.target.selectionStart;
    // Adjust cursor position based on filtered characters
    const removedBefore = newValue.slice(0, cursorPos).replace(/[^ATGCatgc]/g, "").length;
    setCursorPosition(removedBefore);
    onChange(filteredValue);
  };

  return (
    <div className="tg-highlighted-input-wrapper">
      {/* Visible overlay with colored text - highlight non-binding positions */}
      {normalizedValue && hasHighlights && (
        <div className="tg-highlighted-input-overlay">
          {normalizedValue.split("").map((base, i) => {
            // Check if this position doesn't match the template
            const isMismatch = fullPrimerMismatchPositions.includes(i);

            return (
              <span
                key={i}
                className={classNames("tg-input-char", {
                  "tg-input-mismatch": isMismatch
                })}
              >
                {base}
              </span>
            );
          })}
        </div>
      )}
      {/* Actual input (transparent when showing overlay) */}
      <input
        ref={inputRef}
        type="text"
        className={classNames("bp3-input tg-primer-input", {
          "tg-input-transparent": normalizedValue && hasHighlights
        })}
        value={value || ""}
        onChange={handleChange}
        placeholder={placeholder}
      />
      {/* Legend below input */}
      {hasHighlights && (
        <div className="tg-input-legend">
          <span className="tg-legend-item">
            <span className="tg-legend-color tg-legend-mismatch" />
            Non-binding ({fullPrimerMismatchPositions.length}bp)
          </span>
        </div>
      )}
    </div>
  );
};

const FindPrimerBindingSitesDialog = props => {
  const {
    sequenceData = { sequence: "" },
    hideModal,
    upsertPrimer,
    annotationVisibilityShow,
    dispatch
  } = props;

  const { selectedEntities } = useTableEntities(dataTableFormName);

  const primerName = useFormValue(dialogFormName, "primerName");
  const primerSequence = useFormValue(dialogFormName, "primerSequence");

  const [bindingSites, setBindingSites] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSiteForPreview, setSelectedSiteForPreview] = useState(null);

  // Use the same Tm calculation method as MeltingTemp component
  const [tmType] = useTmType();
  const getTmCalculator = useCallback(() => {
    return tmType === "neb_tm"
      ? calculateNebTm
      : tmType === "default"
        ? calculateSantaLuciaTm
        : calculateTm;
  }, [tmType]);

  // Handle primer sequence change
  const handlePrimerSequenceChange = useCallback((value) => {
    dispatch(change(dialogFormName, "primerSequence", value));
  }, [dispatch]);

  const handleSearch = useCallback(() => {
    if (!primerSequence || primerSequence.length < 15) {
      window.toastr.warning("Primer sequence must be at least 15 bases long");
      return;
    }

    const tmCalculator = getTmCalculator();
    // Search both strands, min 12bp consecutive binding from 3' end
    // First mismatch ends binding region - everything beyond becomes overhang
    const results = findPrimerBindingSites({
      primerSequence: primerSequence,
      fullSequence: sequenceData.sequence,
      searchReverseStrand: true,
      isCircular: sequenceData.circular,
      minBindingRegion: 12, // At least 12 consecutive matches from 3' end
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
    getTmCalculator
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
          path: "overhangLength",
          displayName: "OH",
          type: "number",
          render: (val, record) => record.hasOverhang ? `${val}bp` : "-"
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
    () => bindingSites.map(s => s.id),
    [bindingSites]
  );

  const previewSiteData = useMemo(() => {
    if (!selectedSiteForPreview) return null;
    return bindingSites.find(s => s.id === selectedSiteForPreview);
  }, [selectedSiteForPreview, bindingSites]);

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

      {/* Custom highlighted primer sequence input */}
      <div className="bp3-form-group">
        <label className="bp3-label">Primer Sequence (5' to 3')</label>
        <HighlightedPrimerInput
          value={primerSequence}
          onChange={handlePrimerSequenceChange}
          selectedSite={previewSiteData}
          placeholder="Enter primer sequence (e.g., ATCGATCGATCG)"
        />
      </div>

      <Button
        intent={Intent.PRIMARY}
        icon="search"
        onClick={handleSearch}
        disabled={!primerSequence || primerSequence.length < 15}
        className="tg-search-button"
      >
        Search
      </Button>
      {primerSequence && primerSequence.length > 0 && primerSequence.length < 15 && (
        <div className="tg-search-hint">
          Minimum 15bp required for meaningful binding site detection
        </div>
      )}

      {hasSearched && (
        <div className="tg-results-section">
          <div className="tg-results-header">
            Found {bindingSites.length} binding site
            {bindingSites.length !== 1 ? "s" : ""}:
          </div>

          {bindingSites.length > 0 ? (
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
                  entities={bindingSites}
                  onRowClick={(e, row) => setSelectedSiteForPreview(row.id)}
                />
              </div>
            </div>
          ) : (
            <Callout intent={Intent.WARNING}>
              No binding sites found. Check the primer sequence.
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
  connect(),
  reduxForm({
    form: dialogFormName
  })
)(FindPrimerBindingSitesDialog);
