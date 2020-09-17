//@ts-ignore
// import { DND5E } from "../../systems/dnd5e/module/config.js";

// get the distance to the token and if it's too far then can't pick it up
export const dist = (p1: PlaceableObject, p2: PlaceableObject): number => {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

export const getCurrencyTypes = (): { [short: string]: string } =>  {
  console.log(`pick-up-stix | utils | getCurrencies`);
  if (game.system.id === 'dnd5e') {
    console.log(`pick-up-stix | utils | getCurrencies | using system 'dnd5e'`);
    //@ts-ignore
    import('../../systems/dnd5e/module/config.js').then(r => {
      return {
        ...r.DND5E.currencies
      };
    });
  }

  return {
    pp: 'Platinum',
    ep: 'Electrum',
    gp: 'Gold',
    sp: 'Silver',
    cp: 'Copper'
  };
}

export const versionDiff = (v1: string, v2: string): number => {
  const v1Parts: number[] = v1.split('.').map(v => Number(v));
  const v2Parts: number[] = v2.split('.').map(v => Number(v));

  if (v1Parts[0] === v2Parts[0]) {
    if (v1Parts[1] === v2Parts[1]) {
      return v1Parts[2] - v2Parts[2];
    }
    return v1Parts[1] - v2Parts[1];
  }
  return v1Parts[0] - v2Parts[0];
}
