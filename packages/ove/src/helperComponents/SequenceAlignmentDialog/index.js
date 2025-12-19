import React, { useState, useCallback } from "react";
import {
  Button,
  Classes,
  Intent,
  TextArea,
  FormGroup,
  RadioGroup,
  Radio,
  Callout,
  Spinner
} from "@blueprintjs/core";
import { compose } from "recompose";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import { wrapDialog } from "@teselagen/ui";
import withEditorProps from "../../withEditorProps";
import "./style.css";

const dialogFormName = "SequenceAlignmentDialog";

/**
 * Parse FASTA format sequences
 */
function parseFasta(fastaText) {
  const sequences = [];
  const lines = fastaText.trim().split("\n");
  let currentName = "";
  let currentSequence = "";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(">")) {
      if (currentName && currentSequence) {
        sequences.push({
          name: currentName,
          sequence: currentSequence.toUpperCase().replace(/[^ACGTURYKMSWBDHVN-]/gi, "")
        });
      }
      currentName = trimmedLine.slice(1).trim() || `Sequence_${sequences.length + 1}`;
      currentSequence = "";
    } else {
      currentSequence += trimmedLine;
    }
  }

  if (currentName && currentSequence) {
    sequences.push({
      name: currentName,
      sequence: currentSequence.toUpperCase().replace(/[^ACGTURYKMSWBDHVN-]/gi, "")
    });
  }

  return sequences;
}

/**
 * Parse plain sequences (one per line)
 */
function parsePlainSequences(text) {
  const sequences = [];
  const lines = text.trim().split(/[\n\r]+/);

  for (let i = 0; i < lines.length; i++) {
    const seq = lines[i].trim().toUpperCase().replace(/[^ACGTURYKMSWBDHVN-]/gi, "");
    if (seq.length > 0) {
      sequences.push({
        name: `Sequence_${sequences.length + 1}`,
        sequence: seq
      });
    }
  }

  return sequences;
}

/**
 * Simple pairwise alignment using Needleman-Wunsch algorithm
 */
function needlemanWunsch(seq1, seq2, match = 2, mismatch = -1, gap = -2) {
  const m = seq1.length;
  const n = seq2.length;

  const score = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  const traceback = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    score[i][0] = i * gap;
    traceback[i][0] = 1;
  }
  for (let j = 0; j <= n; j++) {
    score[0][j] = j * gap;
    traceback[0][j] = 2;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matchScore = score[i-1][j-1] + (seq1[i-1] === seq2[j-1] ? match : mismatch);
      const deleteScore = score[i-1][j] + gap;
      const insertScore = score[i][j-1] + gap;

      if (matchScore >= deleteScore && matchScore >= insertScore) {
        score[i][j] = matchScore;
        traceback[i][j] = 0;
      } else if (deleteScore >= insertScore) {
        score[i][j] = deleteScore;
        traceback[i][j] = 1;
      } else {
        score[i][j] = insertScore;
        traceback[i][j] = 2;
      }
    }
  }

  let alignedSeq1 = "";
  let alignedSeq2 = "";
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && traceback[i][j] === 0) {
      alignedSeq1 = seq1[i-1] + alignedSeq1;
      alignedSeq2 = seq2[j-1] + alignedSeq2;
      i--;
      j--;
    } else if (i > 0 && traceback[i][j] === 1) {
      alignedSeq1 = seq1[i-1] + alignedSeq1;
      alignedSeq2 = "-" + alignedSeq2;
      i--;
    } else {
      alignedSeq1 = "-" + alignedSeq1;
      alignedSeq2 = seq2[j-1] + alignedSeq2;
      j--;
    }
  }

  return { alignedSeq1, alignedSeq2, score: score[m][n] };
}

/**
 * Multiple sequence alignment using progressive alignment
 */
function multipleSequenceAlignment(sequences) {
  if (sequences.length < 2) return sequences;

  const reference = sequences[0];
  const alignedSequences = [{ ...reference, alignedSequence: reference.sequence }];

  for (let i = 1; i < sequences.length; i++) {
    const { alignedSeq1, alignedSeq2 } = needlemanWunsch(
      alignedSequences[0].alignedSequence,
      sequences[i].sequence
    );

    if (alignedSeq1.length > alignedSequences[0].alignedSequence.length) {
      const gapPositions = [];
      let origPos = 0;
      for (let j = 0; j < alignedSeq1.length; j++) {
        if (alignedSeq1[j] === "-" && (origPos >= alignedSequences[0].alignedSequence.length || alignedSequences[0].alignedSequence[origPos] !== "-")) {
          gapPositions.push(j);
        } else {
          origPos++;
        }
      }

      for (let k = 0; k < alignedSequences.length; k++) {
        let newSeq = alignedSequences[k].alignedSequence;
        for (const pos of gapPositions.reverse()) {
          newSeq = newSeq.slice(0, pos) + "-" + newSeq.slice(pos);
        }
        alignedSequences[k].alignedSequence = newSeq;
      }
    }

    alignedSequences.push({
      ...sequences[i],
      alignedSequence: alignedSeq2
    });
  }

  const maxLen = Math.max(...alignedSequences.map(s => s.alignedSequence.length));
  for (const seq of alignedSequences) {
    while (seq.alignedSequence.length < maxLen) {
      seq.alignedSequence += "-";
    }
  }

  return alignedSequences;
}

/**
 * Calculate alignment statistics
 */
function calculateStats(alignedSequences) {
  if (alignedSequences.length < 2) return null;

  const length = alignedSequences[0].alignedSequence.length;
  let matches = 0;
  let mismatches = 0;
  let gaps = 0;

  for (let i = 0; i < length; i++) {
    const bases = alignedSequences.map(s => s.alignedSequence[i]);
    const nonGapBases = bases.filter(b => b !== "-");

    if (nonGapBases.length < bases.length) {
      gaps++;
    }

    if (nonGapBases.length > 1) {
      const allSame = nonGapBases.every(b => b === nonGapBases[0]);
      if (allSame) {
        matches++;
      } else {
        mismatches++;
      }
    }
  }

  const identity = length > 0 ? ((matches / length) * 100).toFixed(1) : 0;

  return { matches, mismatches, gaps, length, identity };
}

/**
 * Generate consensus line
 */
function generateConsensusLine(alignedSequences) {
  if (alignedSequences.length < 2) return "";

  const length = alignedSequences[0].alignedSequence.length;
  let consensus = "";

  for (let i = 0; i < length; i++) {
    const bases = alignedSequences.map(s => s.alignedSequence[i]);
    const nonGapBases = bases.filter(b => b !== "-");

    if (nonGapBases.length === 0) {
      consensus += " ";
    } else if (nonGapBases.every(b => b === nonGapBases[0])) {
      consensus += "*";
    } else {
      consensus += " ";
    }
  }

  return consensus;
}

/**
 * Alignment Result Display Component
 */
function AlignmentResultDisplay({ alignedSequences }) {
  const stats = calculateStats(alignedSequences);
  const consensusLine = generateConsensusLine(alignedSequences);
  const maxNameLen = Math.max(...alignedSequences.map(s => s.name.length), 10);

  // Split into blocks of 60 characters for display
  const blockSize = 60;
  const length = alignedSequences[0]?.alignedSequence.length || 0;
  const blocks = [];

  for (let i = 0; i < length; i += blockSize) {
    blocks.push({
      start: i,
      end: Math.min(i + blockSize, length)
    });
  }

  return (
    <div className="tg-alignment-result-display">
      {stats && (
        <div className="tg-alignment-stats">
          <span>Length: {stats.length}</span>
          <span>Identity: {stats.identity}%</span>
          <span>Matches: {stats.matches}</span>
          <span>Mismatches: {stats.mismatches}</span>
          <span>Gaps: {stats.gaps}</span>
        </div>
      )}

      <div className="tg-alignment-sequences">
        {blocks.map((block, blockIndex) => (
          <div key={blockIndex} className="tg-alignment-block">
            <div className="tg-block-header">
              <span className="tg-position-label">{block.start + 1}</span>
            </div>
            {alignedSequences.map((seq, seqIndex) => (
              <div key={seqIndex} className="tg-alignment-row">
                <span className="tg-seq-name" style={{ width: maxNameLen * 8 + 10 }}>
                  {seq.name.slice(0, 15)}
                </span>
                <span className="tg-seq-data">
                  {seq.alignedSequence.slice(block.start, block.end).split("").map((base, i) => {
                    const isGap = base === "-";
                    const pos = block.start + i;
                    const isMatch = alignedSequences.every(s => s.alignedSequence[pos] === base || s.alignedSequence[pos] === "-");
                    return (
                      <span
                        key={i}
                        className={`tg-base ${isGap ? "tg-gap" : ""} ${!isGap && isMatch ? "tg-match" : ""} ${!isGap && !isMatch ? "tg-mismatch" : ""}`}
                      >
                        {base}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
            <div className="tg-consensus-row">
              <span className="tg-seq-name" style={{ width: maxNameLen * 8 + 10 }}></span>
              <span className="tg-consensus-data">
                {consensusLine.slice(block.start, block.end)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SequenceAlignmentDialog({
  hideDialog,
  sequenceData
}) {
  const [inputText, setInputText] = useState("");
  const [inputFormat, setInputFormat] = useState("fasta");
  const [alignmentResult, setAlignmentResult] = useState(null);
  const [error, setError] = useState(null);
  const [isAligning, setIsAligning] = useState(false);
  const [includeCurrentSeq, setIncludeCurrentSeq] = useState(true);

  const handleAlign = useCallback(() => {
    setError(null);
    setIsAligning(true);

    try {
      let parsedSequences = [];
      if (inputFormat === "fasta") {
        parsedSequences = parseFasta(inputText);
      } else {
        parsedSequences = parsePlainSequences(inputText);
      }

      if (parsedSequences.length === 0) {
        setError("No valid sequences found in input.");
        setIsAligning(false);
        return;
      }

      let sequencesToAlign = [];
      if (includeCurrentSeq && sequenceData && sequenceData.sequence) {
        sequencesToAlign.push({
          name: sequenceData.name || "Current Sequence",
          sequence: sequenceData.sequence.toUpperCase()
        });
      }
      sequencesToAlign = [...sequencesToAlign, ...parsedSequences];

      if (sequencesToAlign.length < 2) {
        setError("At least 2 sequences are required for alignment.");
        setIsAligning(false);
        return;
      }

      setTimeout(() => {
        try {
          const aligned = multipleSequenceAlignment(sequencesToAlign);
          setAlignmentResult(aligned);
          setIsAligning(false);
        } catch (err) {
          setError(`Alignment error: ${err.message}`);
          setIsAligning(false);
        }
      }, 100);
    } catch (err) {
      setError(`Parse error: ${err.message}`);
      setIsAligning(false);
    }
  }, [inputText, inputFormat, includeCurrentSeq, sequenceData]);

  const handleReset = useCallback(() => {
    setAlignmentResult(null);
    setError(null);
  }, []);

  const handleExportFasta = useCallback(() => {
    if (!alignmentResult) return;

    const fastaText = alignmentResult.map(seq =>
      `>${seq.name}\n${seq.alignedSequence}`
    ).join("\n\n");

    const blob = new Blob([fastaText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "alignment.fasta";
    a.click();
    URL.revokeObjectURL(url);
  }, [alignmentResult]);

  return (
    <>
      <div className={Classes.DIALOG_BODY}>
        {!alignmentResult ? (
          <>
            <Callout intent={Intent.PRIMARY} icon="info-sign" style={{ marginBottom: 15 }}>
              Enter sequences to align. You can use FASTA format or plain sequences (one per line).
              {sequenceData?.sequence && " The current sequence can be included as reference."}
            </Callout>

            {sequenceData?.sequence && (
              <FormGroup>
                <label className="bp3-control bp3-checkbox">
                  <input
                    type="checkbox"
                    checked={includeCurrentSeq}
                    onChange={e => setIncludeCurrentSeq(e.target.checked)}
                  />
                  <span className="bp3-control-indicator" />
                  Include current sequence ({sequenceData.name || "Unnamed"}) as reference
                </label>
              </FormGroup>
            )}

            <FormGroup label="Input Format">
              <RadioGroup
                inline
                selectedValue={inputFormat}
                onChange={e => setInputFormat(e.target.value)}
              >
                <Radio label="FASTA" value="fasta" />
                <Radio label="Plain (one per line)" value="plain" />
              </RadioGroup>
            </FormGroup>

            <FormGroup
              label="Sequences"
              helperText={inputFormat === "fasta"
                ? "Paste sequences in FASTA format (e.g., >seq1\\nATCG...)"
                : "Paste one sequence per line"}
            >
              <TextArea
                className="tg-alignment-input"
                fill
                rows={10}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={inputFormat === "fasta"
                  ? ">Sequence1\nATCGATCGATCG\n>Sequence2\nATCGATCGATCG"
                  : "ATCGATCGATCG\nATCGATTGATCG"}
              />
            </FormGroup>

            {error && (
              <Callout intent={Intent.DANGER} icon="error" style={{ marginTop: 10 }}>
                {error}
              </Callout>
            )}
          </>
        ) : (
          <div className="tg-alignment-result">
            <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
              <Button
                icon="arrow-left"
                minimal
                onClick={handleReset}
                text="Back to input"
              />
              <Button
                icon="export"
                minimal
                onClick={handleExportFasta}
                text="Export FASTA"
              />
            </div>
            <AlignmentResultDisplay alignedSequences={alignmentResult} />
          </div>
        )}
      </div>

      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={hideDialog}>Close</Button>
          {!alignmentResult && (
            <Button
              intent={Intent.PRIMARY}
              onClick={handleAlign}
              disabled={!inputText.trim() || isAligning}
              icon={isAligning ? <Spinner size={16} /> : "alignment-horizontal"}
            >
              {isAligning ? "Aligning..." : "Align Sequences"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export default compose(
  wrapDialog({
    isDraggable: true,
    width: 700,
    title: "Sequence Alignment"
  }),
  withEditorProps,
  connect(),
  reduxForm({
    form: dialogFormName
  })
)(SequenceAlignmentDialog);
