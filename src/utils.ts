//@ts-ignore
import { DND5E } from "../../systems/dnd5e/module/config.js";

// get the distance to the token and if it's too far then can't pick it up
export const dist = (p1: PlaceableObject, p2: PlaceableObject): number => {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

export const getCurrencies = (): any =>  {
  if (game.system.id === 'dnd5e' && DND5E && DND5E.currencies) {
    return {
      ...DND5E.currencies
    };
  }

  return {
    pp: 'Platinum',
    ep: 'Electrum',
    gp: 'Gold',
    sp: 'Silver',
    cp: 'Copper'
  };
}
