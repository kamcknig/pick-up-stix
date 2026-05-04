/**
 * Error thrown when a required SystemAdapter method has not been overridden
 * by a concrete subclass. This surfaces missing adapter implementations early
 * with a descriptive message rather than a generic TypeError.
 */
export class NotImplementedError extends Error {
  /**
   * @param {string} [methodName] - Optional name of the unimplemented method.
   */
  constructor(methodName) {
    const msg = methodName
      ? `SystemAdapter subclass did not override "${methodName}"`
      : "SystemAdapter subclass did not override this method";
    super(msg);
    this.name = "NotImplementedError";
  }
}
