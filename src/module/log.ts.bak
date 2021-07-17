const timestamp = () => {
  const d = new Date();
  return `${d.getMinutes()}:${d.getSeconds()}:${d.getMilliseconds()}`;
}

export const log = (...args) => {
  if (!CONFIG.debug['pickUpStix']) {
    return;
  }

  if (args.length === 1 && typeof args[0] === "string") {
    console.log(`${timestamp()} ${args[0]}`);
  }
  else if(Array.isArray(args)) {
    console.log(...args);
  }
}

export const info = (...args) => {
  if (!CONFIG.debug['pickUpStix']) {
    return;
  }

  if (args.length === 1 && typeof args[0] === "string") {
    console.info(`${timestamp()} ${args[0]}`);
  }
  else if(Array.isArray(args)) {
    console.info(...args);
  }
}

export const warn = (...args) => {
  if (!CONFIG.debug['pickUpStix']) {
    return;
  }

  if (args.length === 1 && typeof args[0] === "string") {
    console.warn(`${timestamp()} ${args[0]}`);
  }
  else if(Array.isArray(args)) {
    console.warn(...args);
  }
}

export const error = (...args) => {
  if (args.length === 1 && typeof args[0] === "string") {
    console.error(`${timestamp()} ${args[0]}`);
  }
  else if(Array.isArray(args)) {
    console.log(...args);
  }
}
