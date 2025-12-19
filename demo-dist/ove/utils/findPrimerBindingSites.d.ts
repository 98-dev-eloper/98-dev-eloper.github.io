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
export function findPrimerBindingSites({ primerSequence, fullSequence, maxMismatches, searchReverseStrand, isCircular, calculateTm, minBindingRegion, detectOverhang }: {
    primerSequence: string;
    fullSequence: string;
    maxMismatches: number;
    searchReverseStrand: boolean;
    isCircular: boolean;
    calculateTm: Function;
    minBindingRegion: number;
    detectOverhang: boolean;
}): any[];
export default findPrimerBindingSites;
