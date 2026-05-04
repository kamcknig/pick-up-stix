/**
 * Feature-detected helpers for the v14 native levels system.
 *
 * These helpers degrade to the v13 behavior (no levels, single flat plane)
 * when running on a Foundry version that lacks the `canvas.level` cursor.
 * Every consumer should call through these helpers rather than reading
 * `canvas.level` / `tokenDoc.level` directly so that v13 compatibility
 * remains a one-line check in this file.
 */

/** Returns true when the active client is running v14+ and a Level is currently displayed. */
export function hasLevels() {
  return !!canvas?.level;
}

/** Returns the id of the currently-viewed level, or null on v13 / no active scene. */
export function getViewedLevelId() {
  return canvas?.level?.id ?? null;
}

/**
 * Returns the level id of a token document, or null if absent. Reads from
 * `_source.level` first because v14's animation system can interpolate the
 * live `tokenDoc.level` mid-flight; the source field is the persisted truth.
 *
 * @param {TokenDocument|null} tokenDoc
 * @returns {string|null}
 */
export function getTokenLevelId(tokenDoc) {
  if (!tokenDoc) return null;
  return tokenDoc._source?.level ?? tokenDoc.level ?? null;
}

/**
 * Returns the elevation base (finite floor) of the currently-viewed level,
 * or 0 on v13 / no active level.
 *
 * @returns {number}
 */
export function getViewedLevelElevationBase() {
  return canvas?.level?.elevation?.base ?? 0;
}

/**
 * Decides whether two token documents are on the same level for the purposes
 * of player interaction. Returns true when:
 *  - we are on v13 (no level field exists), OR
 *  - both tokens lack a `level` value, OR
 *  - both tokens carry the same `level` id.
 *
 * Returns false only when both tokens have a `level` and they differ.
 *
 * @param {TokenDocument} tokenDocA
 * @param {TokenDocument} tokenDocB
 * @returns {boolean}
 */
export function tokensOnSameLevel(tokenDocA, tokenDocB) {
  if (!hasLevels()) return true;
  const a = getTokenLevelId(tokenDocA);
  const b = getTokenLevelId(tokenDocB);
  if (!a && !b) return true;
  return a === b;
}
