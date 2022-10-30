import { Socket } from "net";

export const parseHosts = (val: any): string | string[] => {
  if (typeof val === "string") {
    return val.split(",");
  } else if (typeof val === "number") {
    return parseHosts(val.toString());
  } else if (Array.isArray(val)) {
    return val;
  } else {
    throw new Error(`cannot parse object: ${val}`);
  }
};

export const parsePorts = (val: any): string | string[] => parseHosts(val);

export const uniqueKey = (socket: Socket): string => {
  const key = `${socket.remoteAddress}:${socket.remotePort}`;
  return key;
};
