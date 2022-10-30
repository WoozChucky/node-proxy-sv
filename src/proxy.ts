import TcpProxy from "./tcp.proxy";
import { ProxySetupOptions } from "./options/proxy-setup-options";
import { ServiceHost, ServicePort, ServiceTLS } from "./context";

export function proxy(
  selfPort: number,
  destinationHost: ServiceHost,
  destinationPort: ServicePort,
  destinationTLS: ServiceTLS,
  options: ProxySetupOptions
): TcpProxy {
  return new TcpProxy(
    selfPort,
    destinationHost,
    destinationPort,
    destinationTLS,
    options
  );
}
