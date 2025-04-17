/**
 * Type definitions for node-gyp-build
 */

declare module 'node-gyp-build' {
  /**
   * Loads native addons that have been compiled using node-gyp-build.
   * @param directory The directory containing the compiled addon
   * @returns The native addon module
   */
  function build(directory: string): any;

  export default build;
}
