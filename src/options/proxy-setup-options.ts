import { TlsOptions, TLSSocket } from "tls";
import { Socket } from "net";

import { DownstreamInterceptor, UpstreamInterceptor } from "../context";

export interface ProxySetupOptions {
  // Name or IP address of host
  hostname: string;
  // IP address of interface to use to connect to service
  localAddress: string;
  // Port number to use to connect to service
  localPort: number;
  // Be quiet, default: true
  quiet: boolean;
  // Use TLS 1.2 with clients; specify both to also use TLS 1.2 with service
  tls: boolean;
  // Do not accept invalid certificate, default: true
  rejectUnauthorized: boolean;
  // Private key file path, for example: ./cert.pfx
  pfx: string;
  // Passphrase to access private key file
  passphrase: string;
  // List of authorized users
  identUsers: string[];
  // List of allowed IPs
  allowedIPs: string[];

  // Custom tls server options
  customTlsOptions: TlsOptions;
  serviceHostSelected: (proxySocket: Socket | TLSSocket, i: number) => number;
  upstream: UpstreamInterceptor;
  downstream: DownstreamInterceptor;
}
