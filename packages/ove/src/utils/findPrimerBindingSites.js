import {
  findApproxMatches,
  getReverseComplementSequenceString,
  calculatePercentGC,
  calculateEndStability
} from "@teselagen/sequence-utils";

/**
 * Find all potential binding sites for a primer sequence in the target sequence.
 * Supports overhang detection - when a primer has a 5' overhang (non-binding region),
 * we search using only the 3' binding region.
 *
 * @param {Object} options
 * @param {string} options.primerSequence - The primer sequence to search for (5' -> 3')
 * @param {string} options.fullSequence - The full target sequence to search within
 * @param {number} options.maxMismatches - Maximum number of mismatches allowed (0-3)
 * @param {boolean} options.searchReverseStrand - Whether to search the reverse strand
 * @param {boolean} options.isCircular - Whether the target sequence is circular
 * @param {Function} options.calculateTm - Optional function to calculate melting temperature
 * @param {number} options.minBindingRegion - Minimum binding region length (default: 15)
 * @param {boolean} options.detectOverhang - Whether to detect overhang automatically (default: true)
 * @returns {Array} Array of binding site objects
 */
export function findPrimerBindingSites({
  primerSequence,
  fullSequence,
  maxMismatches = 0,
  searchReverseStrand = true,
  isCircular = false,
  calculateTm,
  minBindingRegion = 15,
  detectOverhang = true
}) {
  if (!primerSequence || !fullSequence) {
    return [];
  }

  const normalizedPrimer = primerSequence.toUpperCase().replace(/\s/g, "");
  const normalizedSequence = fullSequence.toUpperCase();
  const results = [];

  // First, try to find exact/approximate matches with the full primer
  const fullMatchResults = searchWithSequence({
    searchSequence: normalizedPrimer,
    targetSequence: normalizedSequence,
    maxMismatches,
    isCircular,
    forward: true,
    originalPrimer: normalizedPrimer,
    overhangLength: 0,
    calculateTm
  });
  results.push(...fullMatchResults);

  // If detectOverhang is enabled,
  // try searching with progressively shorter 3' binding regions (removing 5' overhang)
  if (detectOverhang && normalizedPrimer.length > minBindingRegion) {
    const maxOverhangLength = normalizedPrimer.length - minBindingRegion;

    for (let overhangLen = 1; overhangLen <= maxOverhangLength; overhangLen++) {
      // Get the 3' binding region (remove 5' overhang)
      const bindingRegion = normalizedPrimer.slice(overhangLen);

      // Skip if binding region is too short
      if (bindingRegion.length < minBindingRegion) continue;

      const overhangResults = searchWithSequence({
        searchSequence: bindingRegion,
        targetSequence: normalizedSequence,
        maxMismatches,
        isCircular,
        forward: true,
        originalPrimer: normalizedPrimer,
        overhangLength: overhangLen,
        calculateTm
      });

      // Filter out duplicates (same position already found with full match or shorter overhang)
      overhangResults.forEach(result => {
        const isDuplicate = results.some(
          r => r.start === result.start && r.end === result.end && r.forward === result.forward
        );
        if (!isDuplicate) {
          results.push(result);
        }
      });
    }
  }

  // Reverse strand search
  if (searchReverseStrand) {
    const reverseComplement = getReverseComplementSequenceString(normalizedPrimer);

    // Full match reverse
    const fullReverseResults = searchWithSequence({
      searchSequence: reverseComplement,
      targetSequence: normalizedSequence,
      maxMismatches,
      isCircular,
      forward: false,
      originalPrimer: normalizedPrimer,
      overhangLength: 0,
      calculateTm
    });
    results.push(...fullReverseResults);

    // Overhang detection for reverse strand
    if (detectOverhang && reverseComplement.length > minBindingRegion) {
      const maxOverhangLength = reverseComplement.length - minBindingRegion;

      for (let overhangLen = 1; overhangLen <= maxOverhangLength; overhangLen++) {
        // For reverse complement, the overhang is at the 3' end of the reverse complement
        // which corresponds to the 5' end of the original primer
        const bindingRegion = reverseComplement.slice(0, reverseComplement.length - overhangLen);

        if (bindingRegion.length < minBindingRegion) continue;

        const overhangResults = searchWithSequence({
          searchSequence: bindingRegion,
          targetSequence: normalizedSequence,
          maxMismatches,
          isCircular,
          forward: false,
          originalPrimer: normalizedPrimer,
          overhangLength: overhangLen,
          calculateTm
        });

        overhangResults.forEach(result => {
          const isDuplicate = results.some(
            r => r.start === result.start && r.end === result.end && r.forward === result.forward
          );
          if (!isDuplicate) {
            results.push(result);
          }
        });
      }
    }
  }

  // Sort by position, then by overhang length (prefer no overhang)
  results.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.overhangLength - b.overhangLength;
  });

  // Deduplicate: keep only the best match for each unique position+strand combination
  // Best = fewer mismatches, then shorter overhang (more of the primer binds)
  const deduplicatedResults = deduplicateBindingSites(results);

  // Add unique IDs
  return deduplicatedResults.map((result, index) => ({
    ...result,
    id: `binding-site-${index}`
  }));
}

/**
 * Deduplicate binding sites - keep only the best match for overlapping sites
 * Two sites are considered duplicates if:
 * 1. They share the same end position (same 3' end of binding region)
 * 2. OR they overlap significantly (>50% overlap)
 * Best match criteria (in order):
 * 1. Fewer mismatches
 * 2. Shorter overhang (more primer actually binds)
 * 3. Longer binding region
 */
function deduplicateBindingSites(results) {
  if (results.length <= 1) return results;

  const dominated = new Set();

  for (let i = 0; i < results.length; i++) {
    if (dominated.has(i)) continue;

    for (let j = i + 1; j < results.length; j++) {
      if (dominated.has(j)) continue;

      const a = results[i];
      const b = results[j];

      // Only compare same strand
      if (a.forward !== b.forward) continue;

      // Check if they share the same end position (3' end of binding)
      // This catches overhang variants of the same binding site
      const sameEndPosition = a.end === b.end;

      // Check if sites overlap significantly
      const overlapStart = Math.max(a.start, b.start);
      const overlapEnd = Math.min(a.end, b.end);
      const overlapLength = Math.max(0, overlapEnd - overlapStart + 1);

      const aLength = a.end - a.start + 1;
      const bLength = b.end - b.start + 1;
      const minLength = Math.min(aLength, bLength);

      // Sites are duplicates if they share the same end OR overlap > 50%
      if (sameEndPosition || overlapLength > minLength * 0.5) {
        // Determine which one is better
        const dominated_idx = getBetterBindingSite(a, b) === a ? j : i;
        dominated.add(dominated_idx);
      }
    }
  }

  return results.filter((_, idx) => !dominated.has(idx));
}

/**
 * Compare two binding sites and return the better one
 */
function getBetterBindingSite(a, b) {
  // 1. Prefer fewer mismatches
  if (a.numMismatches !== b.numMismatches) {
    return a.numMismatches < b.numMismatches ? a : b;
  }

  // 2. Prefer shorter overhang (more primer binds to template)
  if (a.overhangLength !== b.overhangLength) {
    return a.overhangLength < b.overhangLength ? a : b;
  }

  // 3. Prefer longer binding region
  const aBindingLen = a.bindingSequence?.length || 0;
  const bBindingLen = b.bindingSequence?.length || 0;
  if (aBindingLen !== bBindingLen) {
    return aBindingLen > bBindingLen ? a : b;
  }

  // If all equal, prefer the first one (already sorted by position)
  return a;
}

/**
 * Internal function to search for a sequence and return results
 */
function searchWithSequence({
  searchSequence,
  targetSequence,
  maxMismatches,
  isCircular,
  forward,
  originalPrimer,
  overhangLength,
  calculateTm
}) {
  const results = [];

  const matches = findApproxMatches(
    searchSequence,
    targetSequence,
    maxMismatches,
    isCircular
  );

  matches.forEach(match => {
    const matchedSequence = targetSequence.slice(
      match.index,
      match.index + searchSequence.length
    );

    // Calculate properties based on the binding region (not the full primer with overhang)
    const bindingRegion = forward
      ? originalPrimer.slice(overhangLength)
      : originalPrimer.slice(0, originalPrimer.length - overhangLength);

    const overhangSequence = overhangLength > 0
      ? (forward ? originalPrimer.slice(0, overhangLength) : originalPrimer.slice(originalPrimer.length - overhangLength))
      : "";

    // For the full primer (including overhang region), compare against extended template
    // to find which positions actually match vs don't match
    // This gives us a complete picture of binding vs non-binding positions
    let fullPrimerMismatchPositions = [];

    if (forward) {
      // Forward primer: overhang is at 5' end (positions 0 to overhangLength-1 in primer)
      // Binding region: positions overhangLength to end
      // We need to check upstream template for overhang region
      const overhangStartInTemplate = match.index - overhangLength;

      // Check overhang positions against upstream template
      for (let i = 0; i < overhangLength; i++) {
        const templateIdx = overhangStartInTemplate + i;
        if (templateIdx < 0 || templateIdx >= targetSequence.length) {
          // Out of template bounds - this is non-binding
          fullPrimerMismatchPositions.push(i);
        } else if (originalPrimer[i] !== targetSequence[templateIdx]) {
          // Doesn't match template
          fullPrimerMismatchPositions.push(i);
        }
        // If matches, don't add to mismatch list (it binds)
      }

      // Add binding region mismatches (offset by overhangLength)
      (match.mismatchPositions || []).forEach(pos => {
        fullPrimerMismatchPositions.push(overhangLength + pos);
      });
    } else {
      // Reverse primer: overhang is at 5' end of primer (but 3' end in template orientation)
      // The searchSequence is reverse complement of binding region
      // Overhang extends beyond the matched region in template
      const overhangStartInTemplate = match.index + searchSequence.length;

      // For reverse primer, overhang sequence is at the END of original primer
      // We compare it with downstream template (need to reverse complement)
      for (let i = 0; i < overhangLength; i++) {
        const templateIdx = overhangStartInTemplate + i;
        const primerIdx = originalPrimer.length - overhangLength + i;
        if (templateIdx >= targetSequence.length) {
          // Out of template bounds - non-binding
          fullPrimerMismatchPositions.push(primerIdx);
        } else {
          // For reverse strand, compare primer base with complement of template
          const templateBase = targetSequence[templateIdx];
          const primerBase = originalPrimer[primerIdx];
          const complementMap = { A: "T", T: "A", G: "C", C: "G" };
          if (primerBase !== complementMap[templateBase]) {
            fullPrimerMismatchPositions.push(primerIdx);
          }
        }
      }

      // Add binding region mismatches
      // For reverse, mismatch positions are relative to searchSequence
      // Need to map back to original primer positions
      (match.mismatchPositions || []).forEach(pos => {
        // searchSequence is reverse complement, so position mapping:
        // pos 0 in searchSequence = position (bindingRegion.length - 1) in binding region
        // which is position (bindingRegion.length - 1) in original primer (since binding is at start for reverse)
        const primerPos = bindingRegion.length - 1 - pos;
        fullPrimerMismatchPositions.push(primerPos);
      });
    }

    results.push({
      start: match.index,
      end: match.index + searchSequence.length - 1,
      forward,
      strand: forward ? "+" : "-",
      numMismatches: match.numMismatches,
      mismatchPositions: match.mismatchPositions || [],
      matchedSequence,
      primerSequence: originalPrimer,
      bindingSequence: bindingRegion,
      overhangSequence,
      overhangLength,
      hasOverhang: overhangLength > 0,
      fullPrimerMismatchPositions, // All positions in full primer that don't match template
      tm: calculateTm ? calculateTm(bindingRegion) : null,
      gcPercent: calculatePercentGC(bindingRegion),
      stability3Prime: calculateEndStability(bindingRegion)
    });
  });

  return results;
}

export default findPrimerBindingSites;
