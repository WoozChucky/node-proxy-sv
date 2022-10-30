import { Socket } from "net";

import { ServiceHost, ServicePort, ServiceTLS } from "../context";

export const parseHosts = (val: ServiceHost): string | string[] => {
  if (typeof val === "string") {
    return val.split(",");
  } else if (Array.isArray(val)) {
    return val;
  } else {
    throw new Error(`cannot parse object: ${val}`);
  }
};

export const parsePorts = (val: ServicePort): string | string[] => {
  if (typeof val === "string") {
    return val.split(",");
  } else if (typeof val === "number") {
    return parseHosts(val.toString());
  } else if (Array.isArray(val)) {
    return val as any;
  } else {
    throw new Error(`cannot parse object: ${val}`);
  }
};

export const parseTLS = (val: ServiceTLS): boolean[] => {
  if (typeof val === "boolean") {
    return [val];
  } else if (Array.isArray(val)) {
    return val;
  } else {
    throw new Error(`cannot parse object: ${val}`);
  }
};

export const uniqueKey = (socket: Socket): string => {
  const key = `${socket.remoteAddress}:${socket.remotePort}`;
  return key;
};
