import {
  findApproxMatches,
  getReverseComplementSequenceString,
  calculatePercentGC,
  calculateEndStability
} from "@teselagen/sequence-utils";

/**
 * Find all potential binding sites for a primer sequence in the target sequence
 *
 * @param {Object} options
 * @param {string} options.primerSequence - The primer sequence to search for (5' -> 3')
 * @param {string} options.fullSequence - The full target sequence to search within
 * @param {number} options.maxMismatches - Maximum number of mismatches allowed (0-2)
 * @param {boolean} options.searchReverseStrand - Whether to search the reverse strand
 * @param {boolean} options.isCircular - Whether the target sequence is circular
 * @param {Function} options.calculateTm - Optional function to calculate melting temperature
 * @returns {Array} Array of binding site objects
 */
export function findPrimerBindingSites({
  primerSequence,
  fullSequence,
  maxMismatches = 0,
  searchReverseStrand = true,
  isCircular = false,
  calculateTm
}) {
  if (!primerSequence || !fullSequence) {
    return [];
  }

  const normalizedPrimer = primerSequence.toUpperCase().replace(/\s/g, "");
  const normalizedSequence = fullSequence.toUpperCase();
  const results = [];

  // Forward strand search (primer binds to template, synthesizes in forward direction)
  const forwardMatches = findApproxMatches(
    normalizedPrimer,
    normalizedSequence,
    maxMismatches,
    isCircular
  );

  forwardMatches.forEach(match => {
    const matchedSequence = normalizedSequence.slice(
      match.index,
      match.index + normalizedPrimer.length
    );

    results.push({
      start: match.index,
      end: match.index + normalizedPrimer.length - 1,
      forward: true,
      strand: "+",
      numMismatches: match.numMismatches,
      mismatchPositions: match.mismatchPositions,
      matchedSequence,
      primerSequence: normalizedPrimer,
      tm: calculateTm ? calculateTm(normalizedPrimer) : null,
      gcPercent: calculatePercentGC(normalizedPrimer),
      stability3Prime: calculateEndStability(normalizedPrimer)
    });
  });

  // Reverse strand search (primer binds to complement strand)
  if (searchReverseStrand) {
    const reverseComplement =
      getReverseComplementSequenceString(normalizedPrimer);

    const reverseMatches = findApproxMatches(
      reverseComplement,
      normalizedSequence,
      maxMismatches,
      isCircular
    );

    reverseMatches.forEach(match => {
      const matchedSequence = normalizedSequence.slice(
        match.index,
        match.index + reverseComplement.length
      );

      results.push({
        start: match.index,
        end: match.index + reverseComplement.length - 1,
        forward: false,
        strand: "-",
        numMismatches: match.numMismatches,
        mismatchPositions: match.mismatchPositions,
        matchedSequence,
        primerSequence: normalizedPrimer,
        tm: calculateTm ? calculateTm(normalizedPrimer) : null,
        gcPercent: calculatePercentGC(normalizedPrimer),
        stability3Prime: calculateEndStability(normalizedPrimer)
      });
    });
  }

  // Sort by position
  results.sort((a, b) => a.start - b.start);

  // Add unique IDs
  return results.map((result, index) => ({
    ...result,
    id: `binding-site-${index}`
  }));
}

export default findPrimerBindingSites;
