//@ts-ignore
// import { DND5E } from  ../../systems/dnd5e/module/config.js";

import { PickUpStixSocketMessage, SocketMessageType } from './module/pick-up-stix/models.js';

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
  else {
    console.warn(`System ${game.system.id} currencies have not been implemented and therefore might not work properly.`);
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

export function onChangeInputDelta(event) {
  const input = event.target;
  const value = input.value;
  if ( ['+', '-'].includes(value[0]) ) {
    let delta = parseFloat(value);
    input.value = getProperty(this.data, input.name) + delta;
  } else if ( value[0] === '=' ) {
    input.value = value.slice(1);
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
      console.warn(`System ${game.system.id} quantity data path not implemented and therefore might not work with item data.`);
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
      console.warn(`System ${game.system.id} price data path not implemented and therefore might not work with item data.`);
      path = 'price';
      break;
  }

  return path;
}