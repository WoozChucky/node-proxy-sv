import { Socket } from "net";
import { TLSSocket } from "tls";

export interface ContextBase {
  buffers: Buffer[];
  connected: boolean;
  proxySocket: Socket | TLSSocket;
  serviceSocket?: Socket | TLSSocket;
}

export interface UpstreamContext extends ContextBase {
  proxySocket: Socket | TLSSocket;
}

export interface DownstreamContext extends ContextBase {
  serviceSocket?: Socket | TLSSocket;
}

export type UpstreamInterceptor = (
  context: UpstreamContext,
  data: Buffer
) => Buffer;

export type DownstreamInterceptor = (
  context: DownstreamContext,
  data: Buffer
) => Buffer;

// Name or IP address of service host(s); if this is a list, performs round-robin load balancing
export type ServiceHost = string | string[];

// Service port number(s); if this a list, it should have as many entries as serviceHost
export type ServicePort = string | number | number[];

export type ServiceTLS = boolean | boolean[];
