import TcpProxy from "./tcp.proxy";

export function proxy(
  selfPort: number,
  destinationHost: string,
  destinationPort: number,
  options: object
): TcpProxy {
  return new TcpProxy(selfPort, destinationHost, destinationPort, options);
}
