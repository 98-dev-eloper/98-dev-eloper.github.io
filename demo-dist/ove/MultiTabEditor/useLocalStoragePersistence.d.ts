/**
 * Hook for persisting multi-tab editor state to localStorage
 *
 * @param {string} baseEditorName - Base name of the multi-tab editor
 * @param {boolean} enabled - Whether persistence is enabled
 * @param {Object} store - Redux store reference
 */
export function useLocalStoragePersistence(baseEditorName: string, enabled: boolean, store: Object): {
    saveNow: () => void;
    clearStorage: () => void;
};
export default useLocalStoragePersistence;
