import {
  getComplementSequenceString,
  calculatePercentGC,
  calculateEndStability
} from "@teselagen/sequence-utils";

/**
 * Find all potential binding sites for a primer sequence in the target sequence.
 *
 * Binding logic:
 * 1. The 3' end of the primer (last base) must match the template exactly
 * 2. Starting from 3' end, at least 12 consecutive bases must match (seed region)
 * 3. Within the binding region, up to 3 mismatches are allowed
 * 4. Any 5' portion that doesn't match is considered overhang
 *
 * @param {Object} options
 * @param {string} options.primerSequence - The primer sequence to search for (5' -> 3')
 * @param {string} options.fullSequence - The full target sequence to search within
 * @param {number} options.maxMismatches - Maximum number of mismatches allowed in binding region (0-3)
 * @param {boolean} options.searchReverseStrand - Whether to search the reverse strand
 * @param {boolean} options.isCircular - Whether the target sequence is circular
 * @param {Function} options.calculateTm - Optional function to calculate melting temperature
 * @param {number} options.minBindingRegion - Minimum binding region length (default: 12)
 * @returns {Array} Array of binding site objects
 */
export function findPrimerBindingSites({
  primerSequence,
  fullSequence,
  maxMismatches = 3,
  searchReverseStrand = true,
  isCircular = false,
  calculateTm,
  minBindingRegion = 12
}) {
  if (!primerSequence || !fullSequence) {
    return [];
  }

  const normalizedPrimer = primerSequence.toUpperCase().replace(/\s/g, "");
  const normalizedSequence = fullSequence.toUpperCase();
  const results = [];

  // Search forward strand (primer binds to + strand, template is 5'->3')
  const forwardResults = searchForBindingSites({
    primer: normalizedPrimer,
    template: normalizedSequence,
    forward: true,
    maxMismatches,
    minBindingRegion,
    isCircular,
    calculateTm
  });
  results.push(...forwardResults);

  // Search reverse strand (primer binds to - strand)
  if (searchReverseStrand) {
    const reverseResults = searchForBindingSites({
      primer: normalizedPrimer,
      template: normalizedSequence,
      forward: false,
      maxMismatches,
      minBindingRegion,
      isCircular,
      calculateTm
    });
    results.push(...reverseResults);
  }

  // Sort by position
  results.sort((a, b) => a.start - b.start);

  // Deduplicate overlapping results
  const deduplicatedResults = deduplicateBindingSites(results);

  // Add unique IDs
  return deduplicatedResults.map((result, index) => ({
    ...result,
    id: `binding-site-${index}`
  }));
}

/**
 * Search for binding sites on a specific strand
 *
 * For FORWARD primer:
 *   - Primer 5'→3' binds to + strand 5'→3'
 *   - Primer's 3' end (last base) must match template
 *
 * For REVERSE primer:
 *   - Primer 5'→3' binds to - strand (complement) 3'→5'
 *   - On + strand, primer's 3' end appears at the LEFT of binding region
 *
 * Binding rules (same for both strands):
 *   1. 3' end must match exactly
 *   2. At least 12 consecutive matches from 3' end (seed region)
 *   3. Extend towards 5' while mismatches <= 3
 *   4. Rest becomes overhang
 */
function searchForBindingSites({
  primer,
  template,
  forward,
  maxMismatches,
  minBindingRegion,
  isCircular,
  calculateTm
}) {
  const results = [];
  const templateLength = template.length;
  const primerLength = primer.length;

  if (forward) {
    // FORWARD: scan for positions where primer's 3' end could bind to + strand
    for (let endPos = primerLength - 1; endPos < templateLength; endPos++) {
      // endPos is where primer's 3' end would be on template
      const startPos = endPos - primerLength + 1;

      if (startPos < 0 && !isCircular) continue;

      // Get full template region matching primer length
      let templateRegion = "";
      for (let i = 0; i < primerLength; i++) {
        const idx = (startPos + i + templateLength) % templateLength;
        templateRegion += template[idx];
      }

      // Find optimal binding using full primer vs template
      const bindingResult = findOptimalBinding(primer, templateRegion, maxMismatches, minBindingRegion);

      if (bindingResult.isValid) {
        const overhangLength = primerLength - bindingResult.bindingLength;
        const overhangSequence = overhangLength > 0 ? primer.slice(0, overhangLength) : "";
        const bindingSeq = primer.slice(overhangLength);

        // Mismatch positions are in full primer coordinates
        // Overhang positions (0 to overhangLength-1) are non-binding
        const fullPrimerMismatchPositions = [];
        for (let i = 0; i < overhangLength; i++) {
          fullPrimerMismatchPositions.push(i);
        }
        // Add actual mismatch positions from binding region
        bindingResult.mismatchPositions.forEach(pos => {
          fullPrimerMismatchPositions.push(pos);
        });

        const actualStart = (startPos + overhangLength + templateLength) % templateLength;
        const matchedSeq = templateRegion.slice(overhangLength);

        results.push({
          start: actualStart,
          end: endPos,
          forward: true,
          strand: "+",
          numMismatches: bindingResult.mismatchPositions.length,
          mismatchPositions: bindingResult.mismatchPositions.map(p => p - overhangLength),
          matchedSequence: matchedSeq,
          primerSequence: primer,
          bindingSequence: bindingSeq,
          overhangSequence,
          overhangLength,
          hasOverhang: overhangLength > 0,
          fullPrimerMismatchPositions,
          tm: calculateTm ? calculateTm(bindingSeq) : null,
          gcPercent: calculatePercentGC(bindingSeq),
          stability3Prime: calculateEndStability(bindingSeq)
        });
      }
    }
  } else {
    // REVERSE: search for reverse complement of primer on + strand
    //
    // When user inputs primer ACACGCTGCGACCGCTATAGT:
    //   - Forward: search for ACACGCTGCGACCGCTATAGT on + strand
    //   - Reverse: search for ACTATAGCGGTCGCAGCGTGT (reverse complement) on + strand
    //     This is equivalent to finding where the original primer binds to - strand
    //
    // CRITICAL: For reverse primer, we must check the ORIGINAL PRIMER's 3' end
    // - Original primer's 3' end = last base of primer
    // - This corresponds to primerRC's 5' end (first base)
    // - So we need to check primerRC[0] matches template[startPos]
    //
    // On + strand coordinates:
    //   - primerRC[0] (= complement of primer's last base) should match template[startPos]
    //   - Original primer's 3' end is at the LEFT of the binding region

    // Get reverse complement of primer
    const primerRC = getComplementSequenceString(primer).split("").reverse().join("");

    for (let startPos = 0; startPos <= templateLength - primerLength; startPos++) {
      // startPos is where primerRC's 5' end (= original primer's 3' end) would be
      const endPos = startPos + primerLength - 1;

      if (endPos >= templateLength && !isCircular) continue;

      // Get template region (+ strand)
      let templateRegion = "";
      for (let i = 0; i < primerLength; i++) {
        const idx = (startPos + i) % templateLength;
        templateRegion += template[idx];
      }

      // For reverse, check from 5' end of primerRC (which is 3' end of original primer)
      // Use findOptimalBindingFrom5Prime which checks primerRC[0] first
      const bindingResult = findOptimalBindingFrom5Prime(primerRC, templateRegion, maxMismatches, minBindingRegion);

      if (bindingResult.isValid) {
        const overhangLength = primerLength - bindingResult.bindingLength;

        // Overhang in primerRC is at 3' end (positions bindingLength to length-1)
        // This corresponds to primer's 5' end (positions 0 to overhangLength-1)
        const overhangSequence = overhangLength > 0 ? primer.slice(0, overhangLength) : "";
        const bindingSeq = primer.slice(overhangLength);

        // Mismatch positions: convert from primerRC coordinates to original primer coordinates
        // primerRC[i] corresponds to primer[length-1-i]
        const fullPrimerMismatchPositions = [];
        // Overhang in original primer is at the 5' end (left side, positions 0 to overhangLength-1)
        for (let i = 0; i < overhangLength; i++) {
          fullPrimerMismatchPositions.push(i);
        }
        // Convert mismatch positions from primerRC to original primer
        // primerRC binding region is positions 0 to bindingLength-1
        // These map to primer positions (length-1) down to (length-bindingLength)
        bindingResult.mismatchPositions.forEach(posInRC => {
          const posInOriginal = primerLength - 1 - posInRC;
          fullPrimerMismatchPositions.push(posInOriginal);
        });

        // Binding region on + strand:
        // primerRC binds from startPos to (startPos + bindingLength - 1)
        // Overhang extends to the right (positions bindingLength to end)
        const bindingStartOnTemplate = startPos;
        const bindingEndOnTemplate = startPos + bindingResult.bindingLength - 1;
        const matchedSeq = templateRegion.slice(0, bindingResult.bindingLength);

        // Mismatch positions relative to binding sequence (in original primer coordinates)
        // Binding region in original primer is positions overhangLength to length-1
        // Mismatch positions need to be converted to be relative to binding start
        const bindingMismatchPositions = bindingResult.mismatchPositions.map(posInRC => {
          // posInRC is in primerRC coordinates (0 = 5' end of RC = 3' end of original)
          // In binding region of original primer, position 0 is primer[overhangLength]
          // primerRC[posInRC] corresponds to primer[length-1-posInRC]
          // posInBinding = (length-1-posInRC) - overhangLength
          return primerLength - 1 - posInRC - overhangLength;
        });

        results.push({
          start: bindingStartOnTemplate,
          end: bindingEndOnTemplate,
          forward: false,
          strand: "-",
          numMismatches: bindingResult.mismatchPositions.length,
          mismatchPositions: bindingMismatchPositions,
          matchedSequence: matchedSeq,
          primerSequence: primer,
          bindingSequence: bindingSeq,
          overhangSequence,
          overhangLength,
          hasOverhang: overhangLength > 0,
          fullPrimerMismatchPositions,
          reverseComplementSearched: primerRC,
          tm: calculateTm ? calculateTm(bindingSeq) : null,
          gcPercent: calculatePercentGC(bindingSeq),
          stability3Prime: calculateEndStability(bindingSeq)
        });
      }
    }
  }

  return results;
}

/**
 * Find the optimal binding region for a primer against a template.
 * Checks from 3' end (last base) - used for FORWARD primers.
 *
 * Algorithm:
 * 1. Start from 3' end of primer (last base)
 * 2. 3' end must match exactly - if not, no binding
 * 3. Extend towards 5' end, counting mismatches
 * 4. Keep extending while total mismatches <= maxMismatches
 * 5. The binding region must be at least minBindingRegion with first 12bp from 3' end being consecutive matches
 * 6. Everything beyond the binding region (towards 5' end) is overhang
 *
 * @returns {Object} { isValid, bindingLength, mismatchPositions, consecutiveMatchesFrom3Prime }
 */
function findOptimalBinding(primer, template, maxMismatches, minBindingRegion) {
  if (primer.length !== template.length) {
    return { isValid: false, bindingLength: 0, mismatchPositions: [], consecutiveMatchesFrom3Prime: 0 };
  }

  const length = primer.length;

  // Check 1: 3' end (last base) must match exactly
  if (primer[length - 1] !== template[length - 1]) {
    return { isValid: false, bindingLength: 0, mismatchPositions: [], consecutiveMatchesFrom3Prime: 0 };
  }

  // Check 2: Count consecutive matches from 3' end (for seed region validation)
  let consecutiveMatchesFrom3Prime = 0;
  for (let i = length - 1; i >= 0; i--) {
    if (primer[i] === template[i]) {
      consecutiveMatchesFrom3Prime++;
    } else {
      break;
    }
  }

  // Need at least minBindingRegion consecutive matches from 3' end
  if (consecutiveMatchesFrom3Prime < minBindingRegion) {
    return { isValid: false, bindingLength: 0, mismatchPositions: [], consecutiveMatchesFrom3Prime };
  }

  // Check 3: Extend binding region towards 5' end while mismatches <= maxMismatches
  // Start from position after the consecutive match region
  const mismatchPositions = [];
  let bindingLength = consecutiveMatchesFrom3Prime;

  // Continue extending towards 5' end (decreasing positions)
  for (let i = length - consecutiveMatchesFrom3Prime - 1; i >= 0; i--) {
    if (primer[i] === template[i]) {
      // Match - extend binding
      bindingLength++;
    } else {
      // Mismatch - check if we can still include it
      if (mismatchPositions.length < maxMismatches) {
        mismatchPositions.push(i);
        bindingLength++;
      } else {
        // Too many mismatches - stop here, rest is overhang
        break;
      }
    }
  }

  return {
    isValid: true,
    bindingLength,
    mismatchPositions,
    consecutiveMatchesFrom3Prime
  };
}

/**
 * Find the optimal binding region for a primer against a template.
 * Checks from 5' end (first base) - used for REVERSE primers where we're
 * checking primerRC against template, but need to validate original primer's 3' end.
 *
 * Algorithm:
 * 1. Start from 5' end of primer (first base) - this is original primer's 3' end
 * 2. 5' end must match exactly - if not, no binding
 * 3. Extend towards 3' end, counting mismatches
 * 4. Keep extending while total mismatches <= maxMismatches
 * 5. The binding region must be at least minBindingRegion with first 12bp from 5' end being consecutive matches
 * 6. Everything beyond the binding region (towards 3' end) is overhang
 *
 * @returns {Object} { isValid, bindingLength, mismatchPositions, consecutiveMatchesFrom5Prime }
 */
function findOptimalBindingFrom5Prime(primer, template, maxMismatches, minBindingRegion) {
  if (primer.length !== template.length) {
    return { isValid: false, bindingLength: 0, mismatchPositions: [], consecutiveMatchesFrom5Prime: 0 };
  }

  const length = primer.length;

  // Check 1: 5' end (first base) must match exactly
  // This is the original primer's 3' end when using primerRC
  if (primer[0] !== template[0]) {
    return { isValid: false, bindingLength: 0, mismatchPositions: [], consecutiveMatchesFrom5Prime: 0 };
  }

  // Check 2: Count consecutive matches from 5' end (for seed region validation)
  let consecutiveMatchesFrom5Prime = 0;
  for (let i = 0; i < length; i++) {
    if (primer[i] === template[i]) {
      consecutiveMatchesFrom5Prime++;
    } else {
      break;
    }
  }

  // Need at least minBindingRegion consecutive matches from 5' end
  if (consecutiveMatchesFrom5Prime < minBindingRegion) {
    return { isValid: false, bindingLength: 0, mismatchPositions: [], consecutiveMatchesFrom5Prime };
  }

  // Check 3: Extend binding region towards 3' end while mismatches <= maxMismatches
  // Start from position after the consecutive match region
  const mismatchPositions = [];
  let bindingLength = consecutiveMatchesFrom5Prime;

  // Continue extending towards 3' end (increasing positions)
  for (let i = consecutiveMatchesFrom5Prime; i < length; i++) {
    if (primer[i] === template[i]) {
      // Match - extend binding
      bindingLength++;
    } else {
      // Mismatch - check if we can still include it
      if (mismatchPositions.length < maxMismatches) {
        mismatchPositions.push(i);
        bindingLength++;
      } else {
        // Too many mismatches - stop here, rest is overhang
        break;
      }
    }
  }

  return {
    isValid: true,
    bindingLength,
    mismatchPositions,
    consecutiveMatchesFrom5Prime
  };
}

/**
 * Deduplicate binding sites - keep only the best match for overlapping sites
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

      // Check if sites overlap significantly
      const overlapStart = Math.max(a.start, b.start);
      const overlapEnd = Math.min(a.end, b.end);
      const overlapLength = Math.max(0, overlapEnd - overlapStart + 1);

      const aLength = a.end - a.start + 1;
      const bLength = b.end - b.start + 1;
      const minLength = Math.min(aLength, bLength);

      // Sites are duplicates if they overlap > 50%
      if (overlapLength > minLength * 0.5) {
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

  return a;
}

export default findPrimerBindingSites;
