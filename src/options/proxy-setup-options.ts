export interface ProxySetupOptions {
  quiet: boolean;
  tls: boolean;
  pfx: string;
  passphrase: string;
  rejectUnauthorized: boolean;
  identUsers: string[];
  allowedIPs: string[];
  hostname: string;
}
