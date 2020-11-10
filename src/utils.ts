//@ts-ignore
// import { DND5E } from  ../../systems/dnd5e/module/config.js";

import { error, log, warn } from './log';

// get the distance to the token and if it's too far then can't pick it up
export const dist = (p1: PlaceableObject, p2: PlaceableObject): number => {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

export const getCurrencyTypes = (): { [short: string]: string } =>  {
  log(`pick-up-stix | utils | getCurrencies`);
  if (game.system.id === 'dnd5e') {
    log(`pick-up-stix | utils | getCurrencies | using system 'dnd5e'`);
    //@ts-ignore
    import('../../systems/dnd5e/module/config.js').then(r => {
      return {
        ...r.DND5E.currencies
      };
    });
  }
  else {
    warn(`System ${game.system.id} currencies have not been implemented and therefore might not work properly.`);
  }

  return {
    pp: 'Platinum',
    ep: 'Electrum',
    gp: 'Gold',
    sp: 'Silver',
    cp: 'Copper'
  };
}

export const versionDiff = (v1: string = '0.0.0', v2: string = '0.0.0'): number => {
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

export const collidedTokens = (options: { x: number, y:number }): Token[] => {
  return canvas.tokens.placeables.filter((p: PlaceableObject) =>
    options.x <= p.x + p.width - 1 && options.x >= p.x && options.y <= p.y + p.height - 1 && options.y >= p.y
  );
}

export function onChangeInputDelta(event) {
  log(`pick-up-stix | onChangeInputDelta`);
  log([event]);
  const input = event.target;
  const value = input.value;
  if ( ['+', '-'].includes(value[0]) ) {
    let delta = parseFloat(value);
    input.value = Math.max(+getProperty(this, input.name) + +delta, 0);
  } else if ( value[0] === '=' ) {
    input.value = Math.max(+value.slice(1), 0);
  }
}

export function getQuantityDataPath(): string {
  let path;

  switch (game.system.id) {
    case 'dnd5e':
      path = 'quantity'
      break;
    case 'pf2e':
      path = 'quantity.value'
      break;
    default:
      warn(`System ${game.system.id} quantity data path not implemented and therefore might not work with item data.`);
      path = 'quantity';
      break;
  }

  return path;
}

export function getPriceDataPath(): string {
  let path;

  switch (game.system.id) {
    case 'dnd5e':
      path = 'price'
      break;
    case 'pf2e':
      path = 'price.value'
      break;
    default:
      warn(`System ${game.system.id} price data path not implemented and therefore might not work with item data.`);
      path = 'price';
      break;
  }

  return path;
}

export function getWeightDataPath(): string {
  let path;

  switch (game.system.id) {
    case 'dnd5e':
      path = 'weight'
      break;
    case 'pf2e':
      path = 'weight.value'
      break;
    default:
      warn(`System ${game.system.id} weight data path not implemented and therefore might not work with item data.`);
      path = 'weight';
      break;
  }

  return path;
}

export const getActorCurrencyPath = (): string => {
  let path;

  switch (game.system.id) {
    case 'dnd5e':
      path = 'data.currency'
      break;
    default:
      warn(`System ${game.system.id} quantity data path not implemented and therefore might not work with item data.`);
      path = 'data.currency';
      break;
  }

  return path;
}

export const amIFirstGm = (): boolean => {
  const firstGm = firstGM();
  return firstGm && game.user === firstGm
}

export const firstGM = () => {
  const firstGm = game.users.find(u => u.isGM && u.active);
  return firstGm;
}

export class Util {

  static joinStrings(arr: string[], separator: string = ":") {
      if (arr.length === 0) return "";
      return arr.reduce((v1, v2) => `${v1}${separator}${v2}`);
  }

}