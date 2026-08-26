/**
 * The `shared` Zone type (D55) - one box, not tied to any particular
 * player. The Table Zone, every standalone `CREATE_ZONE`'d/preset-
 * declared zone, all use this. No default absolute position - it
 * falls into `#zones`'s own normal flex-wrap flow until dragged.
 */
export const className = null;

export function defaultPosition() {
  return null;
}
