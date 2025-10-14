/**
 * Composable for centralized localStorage operations
 * Provides type-safe localStorage access with default values
 */
export function useLocalStorage() {
  /**
   * Get item from localStorage with optional default value
   */
  const getItem = (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? item : defaultValue;
    } catch (error) {
      console.error(`Error reading from localStorage key "${key}":`, error);
      return defaultValue;
    }
  };

  /**
   * Set item in localStorage
   */
  const setItem = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`Error writing to localStorage key "${key}":`, error);
      return false;
    }
  };

  /**
   * Get JSON item from localStorage
   */
  const getJsonItem = (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error parsing JSON from localStorage key "${key}":`, error);
      return defaultValue;
    }
  };

  /**
   * Set JSON item in localStorage
   */
  const setJsonItem = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error writing JSON to localStorage key "${key}":`, error);
      return false;
    }
  };

  /**
   * Remove item from localStorage
   */
  const removeItem = (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing from localStorage key "${key}":`, error);
      return false;
    }
  };

  /**
   * Clear all localStorage
   */
  const clear = () => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  };

  // App-specific helpers
  const getConfigPreset = (kind) => {
    return getItem(`imageBench_${kind}_configPreset`);
  };

  const setConfigPreset = (kind, preset) => {
    return setItem(`imageBench_${kind}_configPreset`, preset);
  };

  const getVariationStrength = () => {
    return getItem('imageBench_variationStrength', '0.12');
  };

  const setVariationStrength = (strength) => {
    return setItem('imageBench_variationStrength', strength);
  };

  const getVaryingSteps = () => {
    return getItem('imageBench_varyingSteps', '24, 26, 28, 30, 32');
  };

  const setVaryingSteps = (steps) => {
    return setItem('imageBench_varyingSteps', steps);
  };

  const getVaryingDenoising = () => {
    return getItem('imageBench_varyingDenoising', '0.42, 0.46, 0.5, 0.54, 0.6');
  };

  const setVaryingDenoising = (denoising) => {
    return setItem('imageBench_varyingDenoising', denoising);
  };

  return {
    getItem,
    setItem,
    getJsonItem,
    setJsonItem,
    removeItem,
    clear,
    // App-specific
    getConfigPreset,
    setConfigPreset,
    getVariationStrength,
    setVariationStrength,
    getVaryingSteps,
    setVaryingSteps,
    getVaryingDenoising,
    setVaryingDenoising
  };
}
