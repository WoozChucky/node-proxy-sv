import util from "util";
import fs from "fs";
import tls, { TLSSocket } from "tls";
import net, { Server, Socket } from "net";

import { parseHosts, parsePorts, uniqueKey } from "./utils/net";
import { ProxySetupOptions } from "./options/proxy-setup-options";

export interface ProxyTLSOptions {
  passphrase: string;
  secureProtocol: string;
  pfx: Buffer;
}

export interface ServiceTLSOptions {
  rejectUnauthorized: boolean;
  secureProtocol: string;
}

export interface IDictionary<T> {
  [index: string]: T;
}

export default class TcpProxy {
  private readonly proxyPort: number;
  private readonly serviceHosts: string | string[];
  private readonly servicePorts: string | string[];
  private readonly options?: ProxySetupOptions;
  private serviceHostIndex: number;
  private readonly proxyTLSOptions: ProxyTLSOptions;
  private readonly servicesTLSOptions: ServiceTLSOptions | ServiceTLSOptions[];
  private readonly proxySockets: any;
  private readonly users: string[];
  private readonly allowedIPs: string[];
  private server: Server;

  /**
   * The constructor stuffings
   * @param selfPort
   * @param destinationHosts
   * @param destinationPort
   * @param options
   */
  constructor(
    selfPort: number,
    destinationHosts: string | string[],
    destinationPort: number | number[] | string | string[],
    options?: ProxySetupOptions
  ) {
    this.proxyPort = selfPort;
    this.serviceHosts = parseHosts(destinationHosts);
    this.servicePorts = parsePorts(destinationPort);
    this.serviceHostIndex = -1;
    this.options = options;

    // Proxy TLS setup

    this.proxyTLSOptions = {
      passphrase: this.options?.passphrase || "",
      pfx: Buffer.of(),
      secureProtocol: "TLSv1_2_method",
    };

    if (this.options?.tls) {
      this.proxyTLSOptions.pfx = fs.readFileSync(this.options.pfx);
    }

    // Service TLS setup

    this.servicesTLSOptions = {
      rejectUnauthorized: this.options?.rejectUnauthorized || false,
      secureProtocol: "TLSv1_2_method",
    };

    this.proxySockets = {} as IDictionary<Socket>;

    if (this.options?.identUsers && this.options?.identUsers.length > 0) {
      this.users = this.options.identUsers;
      this.log("Will only allow these users: ".concat(this.users.join(", ")));
    } else {
      this.users = [];
      this.log("Will allow all users");
    }

    if (this.options?.allowedIPs && this.options.allowedIPs.length !== 0) {
      this.allowedIPs = this.options.allowedIPs;
    } else {
      this.allowedIPs = [];
    }

    // setup proxy socket server
    if (this.options?.tls) {
      this.server = tls.createServer(
        this.proxyTLSOptions,
        this.secureConnectionListener.bind(this)
      );
    } else {
      this.server = net.createServer(
        this.unsecureConnectionListener.bind(this)
      );
    }
    this.server.listen(
      this.proxyPort,
      this.options?.hostname || "get_machine_hostname"
    );
  }

  private secureConnectionListener(socket: TLSSocket): void {
    this.handleClientConnection(socket);
  }

  private unsecureConnectionListener(socket: Socket): void {
    this.handleClientConnection(socket);
  }

  private handleClientConnection(socket: Socket): void {
    if (this.users.length > 0) {
      this.handleAuth(socket);
    } else {
      this.handleClient(socket);
    }
  }

  private handleAuth(proxySocket: Socket) {
    if (this.allowedIPs.includes(proxySocket.remoteAddress || "")) {
      this.handleClient(proxySocket);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: TcpProxy = this;
    const query = util.format("%d, %d", proxySocket.remotePort, this.proxyPort);
    const identitySocket = new net.Socket();
    let response = "";
    let hasResponse = false;
    identitySocket.on("error", function (err: Error) {
      hasResponse = false;
      identitySocket.destroy();
    });
    identitySocket.on("data", function (data) {
      response = data.toString().trim();
      hasResponse = true;
      identitySocket.destroy();
    });
    identitySocket.on("close", function (data) {
      if (!hasResponse && !response) {
        self.log("No identity");
        proxySocket.destroy();
        return;
      }
      const user = response.split(":").pop();
      if (self.users.includes(user || "")) {
        self.handleClient(proxySocket);
      } else {
        self.log(util.format('User "%s" unauthorized', user));
        proxySocket.destroy();
      }
    });
    identitySocket.connect(113, proxySocket.remoteAddress || "", function () {
      identitySocket.write(query);
      identitySocket.end();
    });
  }

  private handleClient(proxySocket: Socket): void {
    const self = this;
    const key = uniqueKey(proxySocket);
    this.proxySockets[`${key}`] = proxySocket;
    const context = {
      buffers: [],
      connected: false,
      proxySocket,
    };
    proxySocket.on("data", function (data) {
      self.handleUpstreamData(context, data);
    });
    proxySocket.on("close", function (hadError) {
      delete self.proxySockets[uniqueKey(proxySocket)];
      if (context.serviceSocket !== undefined) {
        context.serviceSocket.destroy();
      }
    });
    proxySocket.on("error", function (e) {
      if (context.serviceSocket !== undefined) {
        context.serviceSocket.destroy();
      }
    });
  }

  private log(message: string): void {
    if (!this.options?.quiet) {
      // eslint-disable-next-line no-console
      console.log(message);
    }
  }
}
