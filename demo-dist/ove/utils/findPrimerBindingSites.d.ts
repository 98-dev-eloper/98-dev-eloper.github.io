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
export function findPrimerBindingSites({ primerSequence, fullSequence, maxMismatches, searchReverseStrand, isCircular, calculateTm }: {
    primerSequence: string;
    fullSequence: string;
    maxMismatches: number;
    searchReverseStrand: boolean;
    isCircular: boolean;
    calculateTm: Function;
}): any[];
export default findPrimerBindingSites;
