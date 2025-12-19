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
export function findPrimerBindingSites({ primerSequence, fullSequence, maxMismatches, searchReverseStrand, isCircular, calculateTm, minBindingRegion }: {
    primerSequence: string;
    fullSequence: string;
    maxMismatches: number;
    searchReverseStrand: boolean;
    isCircular: boolean;
    calculateTm: Function;
    minBindingRegion: number;
}): any[];
export default findPrimerBindingSites;
